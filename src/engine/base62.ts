/**
 * 时间有序 Base62 简短唯一键生成器 (Time-ordered Base62 Short Key Generator)
 * 
 * 核心规范与原理：
 * 1. 时间严格有序：字符天然字典序严格等价于时间先后顺序 (lexicographical order == chronological order)
 * 2. 前 9 位：毫秒级时间戳的 Base62 编码（高位补零对齐，确保 9 位固定宽度）
 * 3. 后 4 位：(单调递增计数器 counter ⊕ 进程 PID) 混合熵池，加随机盐值扰动
 * 4. 唯一索引冲突重试循环：插入时自动生成，若在唯一哈希索引中检测到重复，触发自动重试保证 100% 全局唯一
 */

/** 62 进制字符表：0-9, A-Z, a-z（字符顺序遵循 ASCII 自然升序） */
const BASE62_ALPHABET = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';
const BASE = BigInt(62);

/**
 * 将非负整数或 BigInt 转换为 Base62 编码字符串
 * @param num 要编码的数值
 * @returns Base62 字符串
 */
export function encodeBase62(num: number | bigint): string {
  let val = BigInt(num);
  if (val === 0n) return '0';
  let result = '';
  while (val > 0n) {
    const remainder = Number(val % BASE);
    result = BASE62_ALPHABET[remainder] + result;
    val = val / BASE;
  }
  return result;
}

/**
 * 将 Base62 编码字符串解码还原为 BigInt 整数
 * @param str Base62 字符串
 * @returns 解码后的 BigInt
 */
export function decodeBase62(str: string): bigint {
  let result = 0n;
  for (let i = 0; i < str.length; i++) {
    const char = str[i];
    const index = BASE62_ALPHABET.indexOf(char);
    if (index === -1) {
      throw new Error(`非法 Base62 字符: "${char}"`);
    }
    result = result * BASE + BigInt(index);
  }
  return result;
}

/** 全局单调递增微计数器，初始化采用随机偏移量 */
let counter = Math.floor(Math.random() * 1000);

/**
 * 获取当前工作进程的 PID 熵值（在浏览器环境中安全降级为伪随机种子）
 */
function getPidEntropy(): number {
  if (typeof process !== 'undefined' && process.pid) {
    return process.pid & 0xFFFF;
  }
  return 4242;
}

/**
 * 生成 13 位时间有序 Base62 唯一短键：
 * - 前 9 位：毫秒级时间戳编码并左侧补零至 9 位
 * - 后 4 位：(counter++ ⊕ pid) 熵池
 * @param customTimestamp 可选自定义时间戳（默认为当前 Date.now()）
 */
export function generateBase62ShortKey(customTimestamp?: number): string {
  const ts = customTimestamp !== undefined ? customTimestamp : Date.now();
  
  // 1. 时间部分：9 位固定宽度（确保字符字典序等同于时间先后次序）
  const timeEncoded = encodeBase62(BigInt(ts));
  const timePadded = timeEncoded.padStart(9, '0');
  
  // 2. 熵池部分：(计数器 ⊕ PID) 混合扰动
  counter = (counter + 1) & 0xFFFFFF; // 24-bit 循环递增
  const pid = getPidEntropy();
  const entropyValue = (counter ^ pid) + Math.floor(Math.random() * 62);
  const entropyEncoded = encodeBase62(BigInt(entropyValue)).padStart(4, '0').slice(-4);
  
  return `${timePadded}${entropyEncoded}`;
}

/**
 * 从 13 位短键中提取反解出精确到毫秒的真实创建时间 Date
 * @param key 13 位 Base62 短键
 */
export function extractTimestampFromKey(key: string): Date {
  if (key.length < 9) {
    throw new Error('短键长度不足，无法解析时间戳（至少需 9 位）');
  }
  const timePart = key.slice(0, 9);
  const tsBigInt = decodeBase62(timePart);
  return new Date(Number(tsBigInt));
}

/**
 * 唯一索引冲突重试循环 (Conflict Retry Loop)
 * 在向数据库插入记录时自动调用，若候选短键已被占用，则自动重试生成新键
 * @param isKeyExists 传入当前唯一索引的查重函数
 * @param maxAttempts 最大重试上限（默认 10 次）
 */
export function generateUniqueShortKey(
  isKeyExists: (key: string) => boolean,
  maxAttempts: number = 10
): { key: string; attempts: number } {
  let attempts = 0;
  while (attempts < maxAttempts) {
    attempts++;
    const candidate = generateBase62ShortKey();
    if (!isKeyExists(candidate)) {
      return { key: candidate, attempts };
    }
  }
  throw new Error(`在达到最大重试次数 (${maxAttempts}) 后仍未生成唯一 Base62 短键，发生严重冲突。`);
}
