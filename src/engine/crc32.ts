/**
 * IEEE 802.3 标准 CRC32 循环冗余校验算法
 * 用于数据库底层存储文件的静默损坏校验、文件完整性防护与自动恢复判定。
 */

/** 预计算的 IEEE 802.3 标准多项式 0xEDB88320 查找表 (256 项) */
const CRC32_TABLE: Uint32Array = (() => {
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let j = 0; j < 8; j++) {
      c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
    }
    table[i] = c >>> 0;
  }
  return table;
})();

/**
 * 计算输入字符串或字节数组的 32 位无符号 CRC 校验和数值
 * @param input 待校验的字符串或 Uint8Array 二进制缓冲
 * @returns 32 位无符号整数
 */
export function crc32(input: string | Uint8Array): number {
  let crc = 0xFFFFFFFF;
  
  if (typeof input === 'string') {
    const encoder = new TextEncoder();
    const bytes = encoder.encode(input);
    for (let i = 0; i < bytes.length; i++) {
      crc = (crc >>> 8) ^ CRC32_TABLE[(crc ^ bytes[i]) & 0xFF];
    }
  } else {
    for (let i = 0; i < input.length; i++) {
      crc = (crc >>> 8) ^ CRC32_TABLE[(crc ^ input[i]) & 0xFF];
    }
  }
  
  return ((crc ^ 0xFFFFFFFF) >>> 0);
}

/**
 * 将 CRC32 校验和格式化为 8 位标准大写十六进制字符串（例如："0x7F2A34C9"）
 * @param input 输入数据
 */
export function crc32Hex(input: string | Uint8Array): string {
  const num = crc32(input);
  return '0x' + num.toString(16).toUpperCase().padStart(8, '0');
}
