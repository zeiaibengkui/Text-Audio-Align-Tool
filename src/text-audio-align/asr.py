from funasr import AutoModel

# 1. 加载模型
# model参数指定了模型名称，FunASR会自动从远程下载
# device="cuda" 使用GPU，若用CPU可改为 "cpu"
model = AutoModel(model="FunAudioLLM/Fun-ASR-Nano-2512", device="cuda")

# 2. 进行识别
# input参数可以是本地音频文件路径，也可以是网络URL
result = model.generate(input="./clip_0001.opus")
print(result[0]["text"])
# 输出: 欢迎大家来体验达摩院推出的语音识别模型。[reference:14]
