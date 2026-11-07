use std::io::SeekFrom;
use std::net::SocketAddr;
use std::num::NonZeroUsize;
use std::path::Path;
use std::sync::{Mutex, OnceLock};
use tokio::io::{AsyncReadExt, AsyncSeekExt, AsyncWriteExt};
use tokio::net::{TcpListener, TcpStream};

static MEDIA_SERVER_PORT: OnceLock<u16> = OnceLock::new();
static THUMB_BYTES_CACHE: OnceLock<Mutex<lru::LruCache<String, Vec<u8>>>> = OnceLock::new();

const MAX_OPEN_RANGE_CHUNK: u64 = 8 * 1024 * 1024; // 8 MB streaming window for open ranges

fn get_thumb_cache() -> &'static Mutex<lru::LruCache<String, Vec<u8>>> {
    THUMB_BYTES_CACHE.get_or_init(|| {
        Mutex::new(lru::LruCache::new(NonZeroUsize::new(500).unwrap()))
    })
}

pub fn get_server_port() -> Option<u16> {
    MEDIA_SERVER_PORT.get().copied()
}

pub fn get_stream_url(file_path: &str) -> Option<String> {
    let port = get_server_port()?;
    let encoded = url_encode(file_path);
    Some(format!("http://127.0.0.1:{}/media?path={}", port, encoded))
}

pub fn get_thumb_url(file_path: &str, size: u32) -> Option<String> {
    let port = get_server_port()?;
    let encoded = url_encode(file_path);
    Some(format!("http://127.0.0.1:{}/thumb?path={}&size={}", port, encoded, size))
}

pub fn start_media_server() {
    tauri::async_runtime::spawn(async move {
        let addr = SocketAddr::from(([127, 0, 0, 1], 0));
        let listener = match TcpListener::bind(addr).await {
            Ok(l) => l,
            Err(e) => {
                log::error!("Failed to bind local media streaming server: {}", e);
                return;
            }
        };

        if let Ok(local_addr) = listener.local_addr() {
            let port = local_addr.port();
            let _ = MEDIA_SERVER_PORT.set(port);
            log::info!("Local media streaming server running at http://127.0.0.1:{}", port);
        }

        loop {
            match listener.accept().await {
                Ok((stream, _)) => {
                    tokio::spawn(async move {
                        if let Err(e) = handle_connection(stream).await {
                            log::debug!("Media server client connection closed: {}", e);
                        }
                    });
                }
                Err(e) => {
                    log::warn!("Media server accept failed: {}", e);
                    break;
                }
            }
        }
    });
}

async fn handle_connection(mut stream: TcpStream) -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
    let mut read_buf = Vec::with_capacity(4096);
    let mut temp_buf = [0u8; 2048];

    // Keep-Alive connection loop: handle multiple HTTP requests on a single TCP socket
    loop {
        // Read until full HTTP headers are received (\r\n\r\n)
        let mut header_end = None;
        while header_end.is_none() {
            let n = match stream.read(&mut temp_buf).await {
                Ok(0) => return Ok(()), // Client closed connection cleanly
                Ok(n) => n,
                Err(ref e) if e.kind() == std::io::ErrorKind::UnexpectedEof => return Ok(()),
                Err(e) => return Err(Box::new(e)),
            };

            read_buf.extend_from_slice(&temp_buf[..n]);

            // Find \r\n\r\n or \n\n
            if let Some(pos) = read_buf.windows(4).position(|w| w == b"\r\n\r\n") {
                header_end = Some(pos + 4);
            } else if let Some(pos) = read_buf.windows(2).position(|w| w == b"\n\n") {
                header_end = Some(pos + 2);
            }

            if read_buf.len() > 65536 {
                send_headers(
                    &mut stream,
                    431,
                    "Request Header Fields Too Large",
                    &[("Content-Length", "0"), ("Connection", "close")],
                )
                .await?;
                return Ok(());
            }
        }

        let end_idx = header_end.unwrap();
        let (method, uri, client_connection_close, range_start, range_end) = {
            let header_bytes = &read_buf[..end_idx];
            let req_str = String::from_utf8_lossy(header_bytes);
            let mut lines = req_str.lines();

            let request_line = match lines.next() {
                Some(l) => l,
                None => return Ok(()),
            };

            let parts: Vec<&str> = request_line.split_whitespace().collect();
            if parts.len() < 2 {
                return Ok(());
            }

            let method = parts[0].to_string();
            let uri = parts[1].to_string();

            let mut close = false;
            let mut r_start = None;
            let mut r_end = None;

            for line in lines {
                let lower = line.to_ascii_lowercase();
                if lower.starts_with("connection:") && lower.contains("close") {
                    close = true;
                } else if lower.starts_with("range:") {
                    if let Some(spec) = line.split(':').nth(1) {
                        let spec = spec.trim();
                        if let Some(range_val) = spec.strip_prefix("bytes=") {
                            let rparts: Vec<&str> = range_val.split('-').collect();
                            if let Some(s) = rparts.first() {
                                if let Ok(parsed_s) = s.trim().parse::<u64>() {
                                    r_start = Some(parsed_s);
                                }
                            }
                            if rparts.len() > 1 && !rparts[1].trim().is_empty() {
                                if let Ok(parsed_e) = rparts[1].trim().parse::<u64>() {
                                    r_end = Some(parsed_e);
                                }
                            }
                        }
                    }
                }
            }
            (method, uri, close, r_start, r_end)
        };

        read_buf.drain(..end_idx);

        let is_get = method == "GET";
        let is_head = method == "HEAD";

        if !is_get && !is_head {
            send_headers(
                &mut stream,
                405,
                "Method Not Allowed",
                &[("Content-Length", "0"), ("Connection", "close")],
            )
            .await?;
            return Ok(());
        }

        // Routing: /thumb or /media
        if uri.starts_with("/thumb") {
            handle_thumb_request(&mut stream, &uri, is_get).await?;
        } else {
            handle_media_request(&mut stream, &uri, is_get, range_start, range_end).await?;
        }

        stream.flush().await?;

        if client_connection_close {
            break;
        }
    }

    Ok(())
}

async fn handle_media_request(
    stream: &mut TcpStream,
    uri: &str,
    is_get: bool,
    range_start: Option<u64>,
    range_end: Option<u64>,
) -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
    let query_path = extract_query_param(uri, "path");
    let file_path_str = match query_path {
        Some(p) => decode_percent(&p),
        None => {
            send_headers(
                stream,
                400,
                "Bad Request",
                &[("Content-Length", "0"), ("Connection", "keep-alive")],
            )
            .await?;
            return Ok(());
        }
    };

    let clean_path = file_path_str.trim().trim_start_matches("file://");
    let file_path = Path::new(clean_path);

    if !file_path.is_file() {
        send_headers(
            stream,
            404,
            "Not Found",
            &[
                ("Content-Length", "0"),
                ("Access-Control-Allow-Origin", "*"),
                ("Connection", "keep-alive"),
            ],
        )
        .await?;
        return Ok(());
    }

    let metadata = match tokio::fs::metadata(file_path).await {
        Ok(m) => m,
        Err(_) => {
            send_headers(
                stream,
                500,
                "Internal Server Error",
                &[("Content-Length", "0"), ("Connection", "keep-alive")],
            )
            .await?;
            return Ok(());
        }
    };

    let total_len = metadata.len();
    let mime = mime_guess::from_path(file_path)
        .first_or_octet_stream()
        .to_string();

    if let Some(start) = range_start {
        if start >= total_len {
            let range_hdr = format!("bytes */{}", total_len);
            send_headers(
                stream,
                416,
                "Range Not Satisfiable",
                &[
                    ("Content-Range", &range_hdr),
                    ("Content-Length", "0"),
                    ("Access-Control-Allow-Origin", "*"),
                    ("Connection", "keep-alive"),
                ],
            )
            .await?;
            return Ok(());
        }

        // If client didn't specify upper bound, stream remainder of the file (standard HTTP/1.1 range)
        let end = match range_end {
            Some(e) => e.min(total_len - 1),
            None => total_len - 1,
        };

        if end < start {
            send_headers(
                stream,
                416,
                "Range Not Satisfiable",
                &[("Content-Length", "0"), ("Connection", "keep-alive")],
            )
            .await?;
            return Ok(());
        }

        let chunk_len = end - start + 1;
        let content_range = format!("bytes {}-{}/{}", start, end, total_len);
        let chunk_len_str = chunk_len.to_string();

        send_headers(
            stream,
            206,
            "Partial Content",
            &[
                ("Content-Type", &mime),
                ("Content-Range", &content_range),
                ("Content-Length", &chunk_len_str),
                ("Accept-Ranges", "bytes"),
                ("Access-Control-Allow-Origin", "*"),
                ("Connection", "keep-alive"),
            ],
        )
        .await?;

        if is_get {
            let mut file = tokio::fs::File::open(file_path).await?;
            file.seek(SeekFrom::Start(start)).await?;
            let mut limited = file.take(chunk_len);
            let _ = tokio::io::copy(&mut limited, stream).await;
        }
    } else {
        let total_len_str = total_len.to_string();
        send_headers(
            stream,
            200,
            "OK",
            &[
                ("Content-Type", &mime),
                ("Content-Length", &total_len_str),
                ("Accept-Ranges", "bytes"),
                ("Access-Control-Allow-Origin", "*"),
                ("Connection", "keep-alive"),
            ],
        )
        .await?;

        if is_get {
            let mut file = tokio::fs::File::open(file_path).await?;
            let _ = tokio::io::copy(&mut file, stream).await;
        }
    }

    Ok(())
}

async fn handle_thumb_request(
    stream: &mut TcpStream,
    uri: &str,
    is_get: bool,
) -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
    let query_path = extract_query_param(uri, "path");
    let file_path_str = match query_path {
        Some(p) => decode_percent(&p),
        None => {
            send_headers(
                stream,
                400,
                "Bad Request",
                &[("Content-Length", "0"), ("Connection", "keep-alive")],
            )
            .await?;
            return Ok(());
        }
    };

    let size_val: u32 = extract_query_param(uri, "size")
        .and_then(|s| s.parse().ok())
        .unwrap_or(96)
        .clamp(32, 512);

    let clean_path = file_path_str.trim().trim_start_matches("file://");
    let file_path = Path::new(clean_path);

    if !file_path.is_file() {
        send_headers(
            stream,
            404,
            "Not Found",
            &[
                ("Content-Length", "0"),
                ("Access-Control-Allow-Origin", "*"),
                ("Connection", "keep-alive"),
            ],
        )
        .await?;
        return Ok(());
    }

    let cache_key = format!("{}:{}", clean_path, size_val);

    // Check memory cache first
    let cached_bytes = {
        if let Ok(mut cache) = get_thumb_cache().lock() {
            cache.get(&cache_key).cloned()
        } else {
            None
        }
    };

    let (thumb_bytes, mime_type) = match cached_bytes {
        Some(b) => (b, "image/png"),
        None => {
            let generated = generate_thumbnail_bytes(file_path, size_val);
            match generated {
                Ok((bytes, mime)) => {
                    if let Ok(mut cache) = get_thumb_cache().lock() {
                        cache.put(cache_key, bytes.clone());
                    }
                    (bytes, mime)
                }
                Err(e) => {
                    log::debug!("Thumbnail generation failed for {}: {}", clean_path, e);
                    send_headers(
                        stream,
                        500,
                        "Thumbnail Error",
                        &[("Content-Length", "0"), ("Connection", "keep-alive")],
                    )
                    .await?;
                    return Ok(());
                }
            }
        }
    };

    let len_str = thumb_bytes.len().to_string();
    send_headers(
        stream,
        200,
        "OK",
        &[
            ("Content-Type", mime_type),
            ("Content-Length", &len_str),
            ("Cache-Control", "public, max-age=86400"),
            ("Access-Control-Allow-Origin", "*"),
            ("Connection", "keep-alive"),
        ],
    )
    .await?;

    if is_get {
        stream.write_all(&thumb_bytes).await?;
    }

    Ok(())
}

/// Generates a downscaled thumbnail buffer for both images and video files.
pub fn generate_thumbnail_bytes(file_path: &Path, max_size: u32) -> Result<(Vec<u8>, &'static str), String> {
    let media_type = vex_core::detect_media_type(file_path);

    if media_type == vex_core::MediaType::Video {
        // Fast video frame capture via ffmpeg at 1.0s or fallback to 0.0s
        let mut cmd = std::process::Command::new("ffmpeg");
        cmd.args([
            "-ss", "00:00:01",
            "-i",
        ])
        .arg(file_path)
        .args([
            "-vframes", "1",
            "-vf", &format!("scale={}:-1:force_original_aspect_ratio=decrease", max_size),
            "-f", "image2pipe",
            "-c:v", "png",
            "pipe:1",
        ])
        .stdin(std::process::Stdio::null())
        .stdout(std::process::Stdio::piped())
        .stderr(std::process::Stdio::null());

        if let Ok(output) = cmd.output() {
            if output.status.success() && !output.stdout.is_empty() {
                return Ok((output.stdout, "image/png"));
            }
        }

        // Fallback: extract first available frame at 0.0s
        let mut fallback = std::process::Command::new("ffmpeg");
        fallback.args(["-ss", "00:00:00", "-i"])
            .arg(file_path)
            .args([
                "-vframes", "1",
                "-vf", &format!("scale={}:-1:force_original_aspect_ratio=decrease", max_size),
                "-f", "image2pipe",
                "-c:v", "png",
                "pipe:1",
            ])
            .stdin(std::process::Stdio::null())
            .stdout(std::process::Stdio::piped())
            .stderr(std::process::Stdio::null());

        let out = fallback.output().map_err(|e| format!("FFmpeg thumbnail extraction failed: {e}"))?;
        if out.status.success() && !out.stdout.is_empty() {
            return Ok((out.stdout, "image/png"));
        }

        Err("Failed to extract video thumbnail".to_string())
    } else {
        // Raster images, SVGs, etc.
        let loaded = vex_image::load_image(file_path).map_err(|e| e.to_string())?;
        let thumb = vex_image::generate_thumbnail(&loaded.image, max_size, max_size)
            .map_err(|e| e.to_string())?;
        let mut buf = std::io::Cursor::new(Vec::new());
        thumb.write_to(&mut buf, image::ImageFormat::Png)
            .map_err(|e| e.to_string())?;
        Ok((buf.into_inner(), "image/png"))
    }
}

async fn send_headers(
    stream: &mut TcpStream,
    status_code: u16,
    reason: &str,
    headers: &[(&str, &str)],
) -> Result<(), std::io::Error> {
    let mut header_buf = format!("HTTP/1.1 {} {}\r\n", status_code, reason);
    for (k, v) in headers {
        header_buf.push_str(k);
        header_buf.push_str(": ");
        header_buf.push_str(v);
        header_buf.push_str("\r\n");
    }
    header_buf.push_str("\r\n");
    stream.write_all(header_buf.as_bytes()).await?;
    stream.flush().await?;
    Ok(())
}

pub fn extract_query_param(uri: &str, param_name: &str) -> Option<String> {
    let query_start = uri.find('?')?;
    let query_string = &uri[query_start + 1..];
    for pair in query_string.split('&') {
        let mut key_val = pair.splitn(2, '=');
        let key = key_val.next()?;
        if key == param_name {
            return key_val.next().map(|s| s.to_string());
        }
    }
    None
}

pub fn decode_percent(input: &str) -> String {
    let mut result = Vec::new();
    let bytes = input.as_bytes();
    let mut i = 0;
    while i < bytes.len() {
        if bytes[i] == b'%' && i + 2 < bytes.len() {
            if let Ok(val) = u8::from_str_radix(std::str::from_utf8(&bytes[i + 1..i + 3]).unwrap_or(""), 16) {
                result.push(val);
                i += 3;
                continue;
            }
        }
        result.push(bytes[i]);
        i += 1;
    }
    String::from_utf8(result).unwrap_or_else(|_| input.to_string())
}

pub fn url_encode(input: &str) -> String {
    let mut result = String::new();
    for byte in input.bytes() {
        match byte {
            b'a'..=b'z' | b'A'..=b'Z' | b'0'..=b'9' | b'-' | b'_' | b'.' | b'~' | b'/' => {
                result.push(byte as char);
            }
            _ => {
                result.push_str(&format!("%{:02X}", byte));
            }
        }
    }
    result
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_decode_percent() {
        assert_eq!(decode_percent("/path/to/my%20video.mp4"), "/path/to/my video.mp4");
        assert_eq!(decode_percent("%2Ftmp%2Ftest.mkv"), "/tmp/test.mkv");
        assert_eq!(decode_percent("normal_path.webm"), "normal_path.webm");
    }

    #[test]
    fn test_url_encode() {
        assert_eq!(url_encode("/tmp/my video.mp4"), "/tmp/my%20video.mp4");
        assert_eq!(url_encode("/home/user/video.webm"), "/home/user/video.webm");
    }

    #[test]
    fn test_extract_query_param() {
        assert_eq!(
            extract_query_param("/media?path=/tmp/test.mp4&t=12", "path"),
            Some("/tmp/test.mp4".to_string())
        );
        assert_eq!(
            extract_query_param("/thumb?path=/tmp/photo.jpg&size=128", "size"),
            Some("128".to_string())
        );
        assert_eq!(extract_query_param("/media", "path"), None);
    }
}
