# Webcam OCR Tesseract - Offline Version

这个项目是一个使用Tesseract.js的离线OCR扫描器，支持实时摄像头扫描和图片上传扫描。

## 功能特点

- **离线使用**：所有核心文件本地化，无需网络连接
- **实时摄像头OCR**：使用摄像头进行实时文本识别
- **图片上传OCR**：上传图片文件进行文本识别
- **多语言支持**：支持英语、中文、日语、韩语等
- **自动捕获模式**：实时模式下的连续扫描
- **高级图像预处理**：4x放大、自适应阈值等优化
- **智能文本清理**：自动修复常见OCR错误

## 文件结构

```
/
├── index.html          # 实时摄像头扫描页面
├── test.html           # 图片上传测试页面
├── script.js           # 摄像头OCR逻辑
├── test.js             # 图片OCR逻辑
├── styles.css          # 样式文件
├── tesseract-local/    # 本地Tesseract.js库
│   └── tesseract.min.js
└── README.md           # 使用说明
```

## 离线使用方法

1. **启动本地服务器**：
   ```bash
   # 使用Python内置服务器
   python -m http.server 8000
   
   # 或使用Node.js
   npx serve .
   
   # 或使用PHP
   php -S localhost:8000
   ```

2. **打开浏览器**：
   - 访问 `http://localhost:8000` 进入实时摄像头扫描
   - 访问 `http://localhost:8000/test.html` 进入图片上传测试

3. **使用步骤**：
   - **实时模式**：点击"Start Camera"开始摄像头，启用"Auto Capture"进行连续扫描
   - **图片模式**：拖拽或选择图片文件，点击"Recognize"进行OCR识别

## 技术特性

- **图像预处理**：4倍放大 + 自适应阈值二值化
- **多轮OCR**：尝试不同配置，选择最佳结果
- **智能清理**：修复常见字符混淆和格式错误
- **实体提取**：专门识别邮箱、电话、网址
- **离线优先**：优先使用本地文件，CDN作为备用

## 浏览器兼容性

- Chrome/Chromium 88+
- Firefox 85+
- Safari 14+
- Edge 88+

## 注意事项

- 需要HTTPS或localhost运行（摄像头访问限制）
- 首次加载可能需要几秒钟初始化Tesseract.js
- 大图片处理可能需要更长时间
- 建议使用清晰、对比度高的图片获得最佳结果

## 故障排除

- 如果Tesseract.js加载失败，检查本地文件是否存在
- 摄像头权限问题：确保HTTPS或localhost环境
- 识别准确性问题：尝试调整图片角度或光线