import { GoogleGenAI } from "@google/genai";

const MODEL = "gemini-2.5-flash";
const SUMMARY_PROMPT_PREFIX =
  "あなたは配車オペレーターの要約アシスタントです。日本語で、後で見返したときに要点が思い出せる簡潔な箇条書きに要約してください。事実のみを書き、挨拶/確認/相槌などの会話表現は除外してください。箇条書きのみを出力してください。";

const summarizeBtn = document.getElementById("summarizeBtn");
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
  setStatus("要約中");
  summarizeBtn.textContent = "要約する";
};

const scheduleSummary = (text, deltaText) => {
  if (!session || !text.trim()) return;
  if (!deltaText.trim()) return;
  if (summaryTimer) clearTimeout(summaryTimer);
  summaryTimer = setTimeout(async () => {
    if (isSummarizing) return;
    isSummarizing = true;
    abortController = new AbortController();
    const currentSummary = (summaryEl.value || "").trim();
    const prompt = `${SUMMARY_PROMPT_PREFIX}

現在の要約:
${currentSummary || "(なし)"}

新しい入力:
${deltaText.trim()}

指示:
- 現在の要約を更新する
- 追加された事実は追加
- 削除/訂正された事実は削除/修正
- 変更がない項目は維持
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
        setStatus("要約中");
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
  setStatus("要約中");

  return session;
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
  const deltaText = getDeltaText(text, lastInputSnapshot);
  if (!deltaText.trim()) {
    setStatus("更新なし");
    return;
  }
  setStatus("要約中");
  summarizeBtn.textContent = "停止";
  scheduleSummary(text, deltaText);
};

inputEl.addEventListener("input", () => {
  if (!session) return;
  const text = inputEl.value || "";
  const deltaText = getDeltaText(text, lastInputSnapshot);
  scheduleSummary(text, deltaText);
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
