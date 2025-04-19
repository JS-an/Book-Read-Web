// ===== 通用工具函数 =====
// 通用的本地存储操作函数
const storageUtil = {
  get: function (key, defaultValue = null) {
    try {
      const value = localStorage.getItem(key);
      return value ? JSON.parse(value) : defaultValue;
    } catch (error) {
      console.error(`读取 ${key} 失败:`, error);
      return defaultValue;
    }
  },
  set: function (key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
      return true;
    } catch (error) {
      console.error(`保存 ${key} 失败:`, error);
      return false;
    }
  },
  remove: function (key) {
    try {
      localStorage.removeItem(key);
      return true;
    } catch (error) {
      console.error(`删除 ${key} 失败:`, error);
      return false;
    }
  },
};

// 防抖函数
function debounce(func, wait) {
  let timeout;
  return function executedFunction(...args) {
    const later = () => {
      clearTimeout(timeout);
      func(...args);
    };
    clearTimeout(timeout);
    timeout = setTimeout(later, wait);
  };
}

// 通用的格式化时间函数
function formatTime(timestamp) {
  const date = new Date(timestamp);
  const now = new Date();
  const diff = now - date;

  if (diff < 60000) { // 1分钟内
    return '刚刚';
  } else if (diff < 3600000) { // 1小时内
    return `${Math.floor(diff / 60000)}分钟前`;
  } else if (diff < 86400000) { // 1天内
    return `${Math.floor(diff / 3600000)}小时前`;
  } else {
    return date.toLocaleDateString();
  }
}

// 通用的格式化阅读时间函数
function formatReadingTime(seconds) {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  return `${hours}小时${minutes}分钟`;
}

// 显示/隐藏加载指示器
function toggleLoadingIndicator(show) {
  document.querySelector('#loadingIndicator').style.display = show ? 'flex' : 'none';
}

// ===== DOM操作相关函数 =====
// 获取DOM元素的简化函数
const dom = {
  get: function (selector) {
    return document.querySelector(selector);
  },
  getAll: function (selector) {
    return document.querySelectorAll(selector);
  },
  createElement: function (tag, attributes = {}, innerHTML = '') {
    const element = document.createElement(tag);

    for (const key in attributes) {
      element[key] = attributes[key];
    }

    if (innerHTML) {
      element.innerHTML = innerHTML;
    }

    return element;
  }
};

// ===== 文件操作相关函数 =====
// 添加文件大小限制和支持的文件类型
const MAX_FILE_SIZE = 100 * 1024 * 1024; // 10MB
const SUPPORTED_EXTENSIONS = ['.txt'];

// 添加文件验证函数
function validateFile(file) {
  // 检查文件大小
  if (file.size > MAX_FILE_SIZE) {
    throw new Error(`文件过大，请限制在${MAX_FILE_SIZE / 1024 / 1024}MB以内`);
  }

  // 检查文件扩展名
  const extension = file.name.toLowerCase().match(/\.[^.]+$/);
  if (!extension || !SUPPORTED_EXTENSIONS.includes(extension[0])) {
    throw new Error(`不支持的文件格式，仅支持${SUPPORTED_EXTENSIONS.join(', ')}格式`);
  }
}

// 添加分块读取函数
async function readFileInChunks(file, encoding) {
  return new Promise((resolve, reject) => {
    const chunkSize = 1024 * 1024; // 1MB chunks
    let offset = 0;
    let result = '';

    // 创建进度提示元素
    const progressDiv = document.createElement('div');
    progressDiv.style.color = 'white';
    progressDiv.style.marginTop = '10px';
    document.querySelector('#loadingIndicator').appendChild(progressDiv);

    function readNextChunk() {
      const reader = new FileReader();
      const chunk = file.slice(offset, offset + chunkSize);

      reader.onload = function (e) {
        result += e.target.result;
        offset += chunkSize;

        // 更新进度
        const progress = Math.min(100, Math.round((offset / file.size) * 100));
        progressDiv.textContent = `读取进度：${progress}%`;

        if (offset >= file.size) {
          // 完成读取
          document.querySelector('#loadingIndicator').removeChild(progressDiv);
          resolve(result);
        } else {
          // 继续读取下一块
          setTimeout(readNextChunk, 0);
        }
      };

      reader.onerror = function () {
        document.querySelector('#loadingIndicator').removeChild(progressDiv);
        reject(new Error('文件读取失败'));
      };

      reader.readAsText(chunk, encoding);
    }

    readNextChunk();
  });
}

// 编码检测函数
function detectEncoding(bytes) {
  try {
    // 检查 BOM 标记
    if (bytes.length >= 3 && bytes[0] === 0xEF && bytes[1] === 0xBB && bytes[2] === 0xBF) {
      return 'UTF-8';
    }
    if (bytes.length >= 2 && bytes[0] === 0xFF && bytes[1] === 0xFE) {
      return 'UTF-16LE';
    }
    if (bytes.length >= 2 && bytes[0] === 0xFE && bytes[1] === 0xFF) {
      return 'UTF-16BE';
    }

    // 检查是否是 GB18030/GBK/GB2312
    let isGB = true;
    let i = 0;
    while (i < bytes.length - 1 && isGB && i < 100) { // 只检查前100个字节
      if (bytes[i] < 0x80) {
        i++;
      } else if (bytes[i] >= 0x81 && bytes[i] <= 0xFE &&
        bytes[i + 1] >= 0x40 && bytes[i + 1] <= 0xFE) {
        i += 2;
      } else {
        isGB = false;
      }
    }

    if (isGB) {
      return 'GB18030';
    }

    // 默认返回 UTF-8
    return 'UTF-8';
  } catch (error) {
    console.error('编码检测失败:', error);
    throw new Error('无法识别文件编码格式');
  }
}

// ===== IndexedDB操作类 =====
const indexedDBUtil = {
  DB_NAME: 'BookReadWebDB',
  DB_VERSION: 1,
  STORE_NAME: 'fileContents',
  db: null,

  // 初始化数据库
  async init() {
    if (this.db) return Promise.resolve(this.db);

    return new Promise((resolve, reject) => {
      const request = indexedDB.open(this.DB_NAME, this.DB_VERSION);

      request.onerror = (event) => {
        console.error('打开IndexedDB失败:', event.target.error);
        reject(event.target.error);
      };

      request.onsuccess = (event) => {
        this.db = event.target.result;
        console.log('IndexedDB打开成功');
        resolve(this.db);
      };

      request.onupgradeneeded = (event) => {
        const db = event.target.result;
        if (!db.objectStoreNames.contains(this.STORE_NAME)) {
          // 创建文件内容存储，使用文件名作为键
          const store = db.createObjectStore(this.STORE_NAME, { keyPath: 'fileName' });
          // 创建索引用于快速查询
          store.createIndex('lastModified', 'lastModified', { unique: false });
          console.log('创建文件内容存储成功');
        }
      };
    });
  },

  // 添加或更新文件内容
  async addFile(fileName, content) {
    try {
      await this.init();
      
      return new Promise((resolve, reject) => {
        const transaction = this.db.transaction([this.STORE_NAME], 'readwrite');
        const store = transaction.objectStore(this.STORE_NAME);
        
        const file = {
          fileName: fileName,
          content: content,
          lastModified: new Date().getTime()
        };
        
        const request = store.put(file);
        
        request.onsuccess = () => {
          console.log(`文件 ${fileName} 内容已保存到IndexedDB`);
          resolve(true);
        };
        
        request.onerror = (event) => {
          console.error(`保存文件 ${fileName} 内容失败:`, event.target.error);
          reject(event.target.error);
        };
        
        transaction.oncomplete = () => {
          console.log('事务完成');
        };
      });
    } catch (error) {
      console.error('添加文件内容失败:', error);
      return Promise.reject(error);
    }
  },

  // 获取文件内容
  async getFile(fileName) {
    try {
      await this.init();
      
      return new Promise((resolve, reject) => {
        const transaction = this.db.transaction([this.STORE_NAME], 'readonly');
        const store = transaction.objectStore(this.STORE_NAME);
        const request = store.get(fileName);
        
        request.onsuccess = () => {
          if (request.result) {
            console.log(`文件 ${fileName} 内容已从IndexedDB中获取`);
            resolve(request.result);
          } else {
            console.log(`未找到文件 ${fileName} 的内容`);
            resolve(null);
          }
        };
        
        request.onerror = (event) => {
          console.error(`获取文件 ${fileName} 内容失败:`, event.target.error);
          reject(event.target.error);
        };
      });
    } catch (error) {
      console.error('获取文件内容失败:', error);
      return Promise.reject(error);
    }
  },
  
  // 删除文件内容
  async deleteFile(fileName) {
    try {
      await this.init();
      
      return new Promise((resolve, reject) => {
        const transaction = this.db.transaction([this.STORE_NAME], 'readwrite');
        const store = transaction.objectStore(this.STORE_NAME);
        const request = store.delete(fileName);
        
        request.onsuccess = () => {
          console.log(`文件 ${fileName} 内容已从IndexedDB中删除`);
          resolve(true);
        };
        
        request.onerror = (event) => {
          console.error(`删除文件 ${fileName} 内容失败:`, event.target.error);
          reject(event.target.error);
        };
      });
    } catch (error) {
      console.error('删除文件内容失败:', error);
      return Promise.reject(error);
    }
  },
  
  // 获取所有文件信息（不含内容）
  async getAllFileInfo() {
    try {
      await this.init();
      
      return new Promise((resolve, reject) => {
        const transaction = this.db.transaction([this.STORE_NAME], 'readonly');
        const store = transaction.objectStore(this.STORE_NAME);
        const request = store.openCursor();
        
        const files = [];
        
        request.onsuccess = (event) => {
          const cursor = event.target.result;
          if (cursor) {
            // 只返回文件信息，不包含内容以减少内存使用
            files.push({
              fileName: cursor.value.fileName,
              lastModified: cursor.value.lastModified
            });
            cursor.continue();
          } else {
            console.log('获取所有文件信息成功');
            resolve(files);
          }
        };
        
        request.onerror = (event) => {
          console.error('获取所有文件信息失败:', event.target.error);
          reject(event.target.error);
        };
      });
    } catch (error) {
      console.error('获取所有文件信息失败:', error);
      return Promise.reject(error);
    }
  },
  
  // 清空所有文件内容
  async clearAll() {
    try {
      await this.init();
      
      return new Promise((resolve, reject) => {
        const transaction = this.db.transaction([this.STORE_NAME], 'readwrite');
        const store = transaction.objectStore(this.STORE_NAME);
        const request = store.clear();
        
        request.onsuccess = () => {
          console.log('已清空所有文件内容');
          resolve(true);
        };
        
        request.onerror = (event) => {
          console.error('清空所有文件内容失败:', event.target.error);
          reject(event.target.error);
        };
      });
    } catch (error) {
      console.error('清空所有文件内容失败:', error);
      return Promise.reject(error);
    }
  }
};
