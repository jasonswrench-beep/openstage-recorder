// SPDX-License-Identifier: Apache-2.0
//! A picture file for one frame: PNG, written by hand, with no compression.
//!
//! A single still picture does not need the smallest file, it needs to open everywhere and to be right. A PNG whose pixels are
//! stored uncompressed is a valid PNG that every viewer opens; it needs only a checksum (CRC-32) for each chunk and one
//! (Adler-32) for the pixels, both a few lines of plain arithmetic, so there is nothing to download or to licence and the same
//! frame always gives the same bytes. The picture is 8 bits for each of red, green and blue, with no transparency.
//!
//! [`read_back_png`] reads a file made here and checks everything about it, so a file that was cut short or damaged is found
//! out; it is not a general PNG reader.

const SIGNATURE: [u8; 8] = [0x89, b'P', b'N', b'G', 0x0D, 0x0A, 0x1A, 0x0A];
/// The most pixel data one stored block of a zlib stream can hold.
const BLOCK: usize = 65_535;

fn crc_table() -> [u32; 256] {
    let mut table = [0u32; 256];
    for (n, slot) in table.iter_mut().enumerate() {
        let mut c = n as u32;
        for _ in 0..8 {
            c = if c & 1 == 1 { 0xEDB8_8320 ^ (c >> 1) } else { c >> 1 };
        }
        *slot = c;
    }
    table
}

/// The CRC-32 PNG uses, of the pieces one after another.
fn crc32(parts: &[&[u8]]) -> u32 {
    let table = crc_table();
    let mut c = 0xFFFF_FFFFu32;
    for part in parts {
        for &byte in *part {
            c = table[((c ^ byte as u32) & 0xFF) as usize] ^ (c >> 8);
        }
    }
    c ^ 0xFFFF_FFFF
}

fn adler32(data: &[u8]) -> u32 {
    let (mut a, mut b) = (1u32, 0u32);
    for chunk in data.chunks(5552) {
        for &byte in chunk {
            a += byte as u32;
            b += a;
        }
        a %= 65_521;
        b %= 65_521;
    }
    (b << 16) | a
}

fn push_chunk(out: &mut Vec<u8>, kind: &[u8; 4], data: &[u8]) {
    out.extend_from_slice(&(data.len() as u32).to_be_bytes());
    out.extend_from_slice(kind);
    out.extend_from_slice(data);
    out.extend_from_slice(&crc32(&[kind.as_slice(), data]).to_be_bytes());
}

/// The picture as a PNG file: `bgra` is `width * height` pixels of four bytes (blue, green, red, and a byte that is ignored).
pub fn encode_png(width: u32, height: u32, bgra: &[u8]) -> Vec<u8> {
    let (w, h) = (width as usize, height as usize);
    assert!(
        w > 0 && h > 0 && bgra.len() >= w * h * 4,
        "a PNG needs a picture of at least one pixel and all its pixels"
    );
    // Every row starts with a filter byte; 0 means the row is stored as it is.
    let mut raw = Vec::with_capacity((w * 3 + 1) * h);
    for row in bgra.chunks_exact(w * 4).take(h) {
        raw.push(0);
        for px in row.chunks_exact(4) {
            raw.extend_from_slice(&[px[2], px[1], px[0]]);
        }
    }
    // A zlib stream of stored blocks: two header bytes, the blocks, then the Adler-32 of the pixel data.
    let mut z = vec![0x78, 0x01];
    let mut blocks = raw.chunks(BLOCK).peekable();
    while let Some(block) = blocks.next() {
        z.push(if blocks.peek().is_none() { 1 } else { 0 });
        let len = block.len() as u16;
        z.extend_from_slice(&len.to_le_bytes());
        z.extend_from_slice(&(!len).to_le_bytes());
        z.extend_from_slice(block);
    }
    z.extend_from_slice(&adler32(&raw).to_be_bytes());

    let mut ihdr = Vec::with_capacity(13);
    ihdr.extend_from_slice(&width.to_be_bytes());
    ihdr.extend_from_slice(&height.to_be_bytes());
    ihdr.extend_from_slice(&[8, 2, 0, 0, 0]); // 8 bits, colour type 2 (red, green, blue), the usual method, filter and order
    let mut out = Vec::with_capacity(z.len() + 64);
    out.extend_from_slice(&SIGNATURE);
    push_chunk(&mut out, b"IHDR", &ihdr);
    push_chunk(&mut out, b"IDAT", &z);
    push_chunk(&mut out, b"IEND", &[]);
    out
}

/// What a PNG made by [`encode_png`] holds.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct PngPicture {
    pub width: u32,
    pub height: u32,
    /// Red, green, blue for every pixel, row after row.
    pub rgb: Vec<u8>,
}

/// Read back a PNG made by [`encode_png`], checking the signature, the order of the chunks, every chunk's CRC-32, the
/// zlib stream and its Adler-32, and that the pixels are exactly `width * height`. `Err` says in words what is wrong.
pub fn read_back_png(bytes: &[u8]) -> Result<PngPicture, String> {
    if bytes.len() < 8 || bytes[..8] != SIGNATURE {
        return Err("The file does not start like a PNG picture.".into());
    }
    let mut at = 8;
    let mut kinds: Vec<[u8; 4]> = Vec::new();
    let (mut width, mut height) = (0u32, 0u32);
    let mut idat: Vec<u8> = Vec::new();
    while at < bytes.len() {
        if at + 12 > bytes.len() {
            return Err("The picture file is cut short.".into());
        }
        let len = u32::from_be_bytes([bytes[at], bytes[at + 1], bytes[at + 2], bytes[at + 3]]) as usize;
        let kind: [u8; 4] = [bytes[at + 4], bytes[at + 5], bytes[at + 6], bytes[at + 7]];
        if at + 12 + len > bytes.len() {
            return Err("The picture file is cut short.".into());
        }
        let data = &bytes[at + 8..at + 8 + len];
        let stored =
            u32::from_be_bytes([bytes[at + 8 + len], bytes[at + 9 + len], bytes[at + 10 + len], bytes[at + 11 + len]]);
        if crc32(&[kind.as_slice(), data]) != stored {
            return Err(format!("A part of the picture file ({}) is damaged.", String::from_utf8_lossy(&kind)));
        }
        match &kind {
            b"IHDR" => {
                if len != 13 || data[8..13] != [8, 2, 0, 0, 0] {
                    return Err("The picture file is not the kind this program makes.".into());
                }
                width = u32::from_be_bytes([data[0], data[1], data[2], data[3]]);
                height = u32::from_be_bytes([data[4], data[5], data[6], data[7]]);
            }
            b"IDAT" => idat.extend_from_slice(data),
            _ => {}
        }
        kinds.push(kind);
        at += 12 + len;
    }
    if kinds != [*b"IHDR", *b"IDAT", *b"IEND"] {
        return Err("The picture file does not have the parts it should.".into());
    }
    if idat.len() < 6 || idat[0] != 0x78 {
        return Err("The picture data does not start like a zlib stream.".into());
    }
    let mut raw: Vec<u8> = Vec::new();
    let mut i = 2;
    loop {
        if i + 5 > idat.len() {
            return Err("The picture data is cut short.".into());
        }
        let last = idat[i] & 1 == 1;
        if idat[i] & 0b110 != 0 {
            return Err("The picture data is not stored the way this program stores it.".into());
        }
        let len = u16::from_le_bytes([idat[i + 1], idat[i + 2]]) as usize;
        let check = u16::from_le_bytes([idat[i + 3], idat[i + 4]]);
        if check != !(len as u16) || i + 5 + len > idat.len() {
            return Err("The picture data is damaged.".into());
        }
        raw.extend_from_slice(&idat[i + 5..i + 5 + len]);
        i += 5 + len;
        if last {
            break;
        }
    }
    if idat.len() != i + 4 || u32::from_be_bytes([idat[i], idat[i + 1], idat[i + 2], idat[i + 3]]) != adler32(&raw) {
        return Err("The picture data does not add up (its checksum is wrong).".into());
    }
    let row = width as usize * 3 + 1;
    if width == 0 || height == 0 || raw.len() != row * height as usize {
        return Err("The picture holds a different number of pixels than its size says.".into());
    }
    let mut rgb = Vec::with_capacity(width as usize * 3 * height as usize);
    for line in raw.chunks_exact(row) {
        if line[0] != 0 {
            return Err("A row of the picture uses a filter this program does not write.".into());
        }
        rgb.extend_from_slice(&line[1..]);
    }
    Ok(PngPicture { width, height, rgb })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn the_two_checksums_are_the_standard_ones() {
        // The PNG specification's own end chunk has the CRC AE 42 60 82; "Wikipedia" is the usual Adler-32 example.
        assert_eq!(crc32(&[b"IEND".as_slice()]), 0xAE42_6082);
        assert_eq!(crc32(&[b"123456789".as_slice()]), 0xCBF4_3926);
        assert_eq!(crc32(&[b"12345".as_slice(), b"6789".as_slice()]), 0xCBF4_3926, "in pieces it is the same");
        assert_eq!(adler32(b"Wikipedia"), 0x11E6_0398);
        assert_eq!(adler32(&[]), 1, "nothing at all is 1");
    }

    #[test]
    fn a_small_picture_is_a_png_with_the_colours_in_the_right_order() {
        // Blue, green, red, white; each pixel is B, G, R, unused.
        let bgra = [255, 0, 0, 0, 0, 255, 0, 0, 0, 0, 255, 0, 255, 255, 255, 0];
        let png = encode_png(2, 2, &bgra);
        assert_eq!(&png[..8], &SIGNATURE);
        assert_eq!(
            &png[png.len() - 12..],
            &[0, 0, 0, 0, b'I', b'E', b'N', b'D', 0xAE, 0x42, 0x60, 0x82],
            "ends with the standard end chunk"
        );
        let back = read_back_png(&png).unwrap();
        assert_eq!((back.width, back.height), (2, 2));
        assert_eq!(back.rgb, [0, 0, 255, /* blue pixel as R,G,B */ 0, 255, 0, 255, 0, 0, 255, 255, 255]);
    }

    #[test]
    fn a_big_picture_spans_several_stored_blocks_and_comes_back_exactly() {
        let (w, h) = (300usize, 200usize);
        let mut bgra = Vec::with_capacity(w * h * 4);
        for y in 0..h {
            for x in 0..w {
                bgra.extend_from_slice(&[(x * 7 + y) as u8, (x + y * 3) as u8, (x * y) as u8, 0xAB]);
            }
        }
        let png = encode_png(w as u32, h as u32, &bgra);
        assert!((w * 3 + 1) * h > 2 * BLOCK, "more than two blocks of pixels");
        let back = read_back_png(&png).unwrap();
        assert_eq!((back.width as usize, back.height as usize), (w, h));
        for (i, px) in bgra.chunks_exact(4).enumerate() {
            assert_eq!(&back.rgb[i * 3..i * 3 + 3], &[px[2], px[1], px[0]], "pixel {i}");
        }
        assert_eq!(encode_png(w as u32, h as u32, &bgra), png, "the same picture is the same bytes every time");
    }

    #[test]
    fn a_picture_that_is_cut_short_or_damaged_is_found_out_in_words() {
        let png = encode_png(8, 8, &vec![0x40; 8 * 8 * 4]);
        assert!(read_back_png(&png).is_ok());
        assert_eq!(read_back_png(&png[..png.len() - 1]), Err("The picture file is cut short.".into()));
        assert_eq!(read_back_png(&png[..5]), Err("The file does not start like a PNG picture.".into()));
        let mut bad_pixel = png.clone();
        let at = bad_pixel.len() - 30;
        bad_pixel[at] ^= 0x01;
        assert_eq!(read_back_png(&bad_pixel), Err("A part of the picture file (IDAT) is damaged.".into()));
        let mut bad_size = png.clone();
        bad_size[19] = 9; // the width, which the chunk's checksum covers
        assert_eq!(read_back_png(&bad_size), Err("A part of the picture file (IHDR) is damaged.".into()));
    }

    #[test]
    fn a_one_pixel_picture_works() {
        let png = encode_png(1, 1, &[10, 20, 30, 0]);
        assert_eq!(read_back_png(&png).unwrap().rgb, [30, 20, 10]);
    }
}
