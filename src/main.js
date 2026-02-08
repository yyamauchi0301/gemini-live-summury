import { GoogleGenAI } from "@google/genai";

const MODEL = "gemini-2.5-flash";
const SUMMARY_PROMPT_PREFIX =
  "あなたは配車オペレーターの要約アシスタントです。日本語で、後で見返したときに要点が思い出せる簡潔な箇条書きに要約してください。事実のみを書き、挨拶/確認/相槌などの会話表現は除外してください。箇条書きのみを出力してください。";

const summarizeBtn = document.getElementById("summarizeBtn");
const startSpeechBtn = document.getElementById("startSpeechBtn");
const stopSpeechBtn = document.getElementById("stopSpeechBtn");
const statusEl = document.getElementById("status");
const inputEl = document.getElementById("inputText");
const summaryEl = document.getElementById("summary");
const promptEl = document.getElementById("promptText");
const errorEl = document.getElementById("error");

const apiKey = import.meta.env.GEMINI_API_KEY;
let session = null;
let summaryTimer = null;
let isSummarizing = false;
let lastInputSnapshot = "";
let abortController = null;
let recognition = null;
let isRecognizing = false;
let fullTranscript = "";
let speechPauseTimer = null;
let lastSpeechTime = 0;
const SPEECH_PAUSE_THRESHOLD = 2000; // 2秒間音声が検出されない場合に要約を送る

const formatError = (err) => {
  if (!err) return "unknown";
  if (typeof err === "string") return err;
  const name = err.name ? `${err.name}: ` : "";
  const message = err.message || String(err);
  return `${name}${message}`;
};

const setStatus = (text) => {
  statusEl.textContent = text;
};

const setError = (text) => {
  errorEl.textContent = text || "";
  if (text) {
    console.error(text);
  }
};

const getDeltaText = (currentText, previousText) => {
  if (!currentText.trim()) return "";
  if (currentText.startsWith(previousText)) {
    return currentText.slice(previousText.length).trim();
  }
  return currentText.trim();
};

const stopSummary = () => {
  if (summaryTimer) {
    clearTimeout(summaryTimer);
    summaryTimer = null;
  }
  if (abortController) {
    abortController.abort();
    abortController = null;
  }
  isSummarizing = false;
  setStatus(isRecognizing ? "音声認識中" : "準備完了");
  summarizeBtn.textContent = "要約する";
};

const scheduleSummary = (text) => {
  if (!session || !text.trim()) return;
  if (summaryTimer) clearTimeout(summaryTimer);
  // 音声認識中はより短いタイマーで要約を送る
  const delay = isRecognizing ? 500 : 800;
  summaryTimer = setTimeout(async () => {
    if (isSummarizing) return;
    isSummarizing = true;
    abortController = new AbortController();
    const currentSummary = (summaryEl.value || "").trim();
    const prompt = `${SUMMARY_PROMPT_PREFIX}

現在の要約:
${currentSummary || "(なし)"}

入力テキスト全体:
${text.trim()}

指示:
- 入力テキスト全体の文脈から要約を生成する
- 現在の要約を更新する
- 追加された事実は追加
- 削除/訂正された事実は削除/修正
- 変更がない項目は維持
- 電話番号などの数字が途中で途切れた場合（例：「070」と「12345678」）、前の項目と統合して完全な情報にする（例：「07012345678」）
- 同じ項目（電話番号、顧客名など）が重複している場合、最新の完全な情報で置き換える
- 重複する項目は削除する
- 最終結果の箇条書きのみ出力
`;
    if (promptEl) {
      promptEl.value = prompt.trim();
    }
    try {
      setStatus("要約中");
      const response = await session.models.generateContent({
        model: MODEL,
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        signal: abortController.signal,
      });
      if (!abortController.signal.aborted) {
        summaryEl.value = response?.text || "";
        setStatus(isRecognizing ? "音声認識中" : "準備完了");
        lastInputSnapshot = text;
      }
    } catch (err) {
      if (err.name !== "AbortError") {
        setError(`送信エラー: ${formatError(err)}`);
      }
    } finally {
      if (!abortController?.signal.aborted) {
        isSummarizing = false;
        summarizeBtn.textContent = "要約する";
      }
      abortController = null;
    }
  }, 800);
};

const ensureSession = async () => {
  if (session) return session;
  if (!apiKey) {
    throw new Error("GEMINI_API_KEY が設定されていません。");
  }

  session = new GoogleGenAI({ apiKey });
  setStatus("準備完了");

  return session;
};

const setupSpeechRecognition = () => {
  const SpeechRecognition =
    window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SpeechRecognition) {
    throw new Error("このブラウザは Web Speech API に対応していません。");
  }

  recognition = new SpeechRecognition();
  recognition.lang = "ja-JP";
  recognition.continuous = true;
  recognition.interimResults = true;

  recognition.onstart = () => {
    isRecognizing = true;
    setStatus("音声認識中");
    startSpeechBtn.disabled = true;
    stopSpeechBtn.disabled = false;
  };

  recognition.onresult = (event) => {
    let interim = "";
    let hasFinal = false;
    let finalText = "";
    
    for (let i = event.resultIndex; i < event.results.length; i += 1) {
      const result = event.results[i];
      const text = result[0].transcript;
      if (result.isFinal) {
        hasFinal = true;
        finalText += text + " ";
        fullTranscript = `${fullTranscript}${text} `.trim();
      } else {
        interim += text;
      }
    }

    // 音声が検出されたタイミングを記録
    lastSpeechTime = Date.now();

    if (hasFinal) {
      inputEl.value = fullTranscript;
      if (session) {
        // 確定したテキストがある場合、すぐに要約を送る
        const currentText = fullTranscript;
        scheduleSummary(currentText);
      }
      // 一時停止タイマーをリセット
      if (speechPauseTimer) {
        clearTimeout(speechPauseTimer);
        speechPauseTimer = null;
      }
    } else if (interim) {
      // 中間結果を表示
      inputEl.value = `${fullTranscript} ${interim}`.trim();
      
      // 一時停止タイマーをリセット
      if (speechPauseTimer) {
        clearTimeout(speechPauseTimer);
      }
      
      // 一定時間音声が検出されない場合に要約を送る
      speechPauseTimer = setTimeout(() => {
        const currentText = inputEl.value || fullTranscript;
        if (currentText.trim() && session && !isSummarizing) {
          scheduleSummary(currentText);
        }
        speechPauseTimer = null;
      }, SPEECH_PAUSE_THRESHOLD);
    }
  };

  recognition.onerror = (event) => {
    const errorCode = event.error || "unknown";
    const messages = {
      "not-allowed": "マイクへのアクセスが許可されていません。",
      "service-not-allowed":
        "マイクへのアクセスがブロックされています。権限を確認してください。",
      "audio-capture": "マイクが見つかりません。",
      network: "音声認識のネットワークエラーが発生しました。",
      aborted: "音声認識が中断されました。",
      "no-speech": "音声が検出されませんでした。",
      "language-not-supported": "指定した言語がサポートされていません。",
    };
    const detail = messages[errorCode] || "不明なエラーが発生しました。";
    
    // no-speechエラーの場合は要約を送る（音声が一時停止したタイミング）
    if (errorCode === "no-speech") {
      const currentText = inputEl.value || fullTranscript;
      if (currentText.trim() && session && !isSummarizing) {
        scheduleSummary(currentText);
      }
    } else {
      setError(`音声認識エラー(${errorCode}): ${detail}`);
    }
  };

  recognition.onend = () => {
    // 一時停止タイマーをクリア
    if (speechPauseTimer) {
      clearTimeout(speechPauseTimer);
      speechPauseTimer = null;
    }
    
    // 残っているテキストがあれば要約を送る
    const currentText = inputEl.value || fullTranscript;
    if (currentText.trim() && session && !isSummarizing) {
      scheduleSummary(currentText);
    }
    
    isRecognizing = false;
    startSpeechBtn.disabled = false;
    stopSpeechBtn.disabled = true;
    setStatus("準備完了");
  };
};

const startSpeechRecognition = async () => {
  setError("");
  await ensureSession();
  if (!recognition) {
    setupSpeechRecognition();
  }
  if (isRecognizing) {
    return;
  }
  fullTranscript = inputEl.value || "";
  lastInputSnapshot = fullTranscript;
  try {
    recognition.start();
  } catch (err) {
    setError(`音声認識開始エラー: ${formatError(err)}`);
  }
};

const stopSpeechRecognition = () => {
  if (recognition && isRecognizing) {
    // 一時停止タイマーをクリア
    if (speechPauseTimer) {
      clearTimeout(speechPauseTimer);
      speechPauseTimer = null;
    }
    
    recognition.stop();
    isRecognizing = false;
    startSpeechBtn.disabled = false;
    stopSpeechBtn.disabled = true;
    setStatus("準備完了");
  }
};

const summarize = async () => {
  if (isSummarizing) {
    stopSummary();
    return;
  }
  setError("");
  await ensureSession();
  const text = inputEl.value || "";
  if (!text.trim()) {
    setError("入力テキストが空です。");
    return;
  }
  setStatus("要約中");
  summarizeBtn.textContent = "停止";
  scheduleSummary(text);
};

inputEl.addEventListener("input", () => {
  if (!session || isRecognizing) return;
  const text = inputEl.value || "";
  if (text.trim()) {
    scheduleSummary(text);
  }
});

startSpeechBtn.addEventListener("click", () => {
  startSpeechRecognition().catch((err) => {
    setError(formatError(err));
  });
});

stopSpeechBtn.addEventListener("click", () => {
  stopSpeechRecognition();
});

summarizeBtn.addEventListener("click", () => {
  summarize().catch((err) => {
    setError(formatError(err));
  });
});

window.addEventListener("unhandledrejection", (event) => {
  setError(`未処理のPromiseエラー: ${formatError(event.reason)}`);
});

window.addEventListener("error", (event) => {
  setError(`実行時エラー: ${formatError(event.error || event.message)}`);
});

setStatus("待機中");
ensureSession().catch(() => {});
