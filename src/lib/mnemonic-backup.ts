import { wordlist } from "@scure/bip39/wordlists/english.js";
import { normalizeMnemonic, validateMnemonic } from "../crypto";
import { download } from "./browser";
import { PROJECT_NAME } from "./project";

export type MnemonicQuestion = {
  position: number;
  options: string[];
};
export type MnemonicAnswers = Record<number, string>;

const questionCount = 3;
const optionCount = 4;
const englishWords = new Set(wordlist);

function mnemonicWords(phrase: string, require24 = false) {
  const normalized = normalizeMnemonic(phrase);
  const words = normalized.split(" ");
  if (!validateMnemonic(normalized) || (require24 && words.length !== 24))
    throw new Error(require24 ? "需要有效的 24 词助记词" : "助记词无效");
  return words;
}

function randomIndex(length: number) {
  const range = 0x1_0000_0000;
  const limit = Math.floor(range / length) * length;
  const value = new Uint32Array(1);
  do {
    crypto.getRandomValues(value);
  } while (value[0] >= limit);
  return value[0] % length;
}

function sample<T>(values: readonly T[], count: number) {
  const pool = [...values];
  for (let index = 0; index < count; index++) {
    const chosen = index + randomIndex(pool.length - index);
    [pool[index], pool[chosen]] = [pool[chosen], pool[index]];
  }
  return pool.slice(0, count);
}

export function createMnemonicQuiz(phrase: string): MnemonicQuestion[] {
  const words = mnemonicWords(phrase, true);
  return sample(
    words.map((_, index) => index),
    questionCount,
  )
    .sort((a, b) => a - b)
    .map((index) => {
      const correct = words[index];
      const alternatives = sample(
        wordlist.filter((word) => word !== correct),
        optionCount - 1,
      );
      return {
        position: index + 1,
        options: sample([correct, ...alternatives], optionCount),
      };
    });
}

export function checkMnemonicQuiz(
  phrase: string,
  questions: MnemonicQuestion[],
  answers: MnemonicAnswers,
) {
  const words = mnemonicWords(phrase, true);
  if (
    questions.length !== questionCount ||
    new Set(questions.map((question) => question.position)).size !==
      questionCount ||
    questions.some(
      (question) =>
        !Number.isInteger(question.position) ||
        question.position < 1 ||
        question.position > words.length ||
        question.options.length !== optionCount ||
        new Set(question.options).size !== optionCount ||
        question.options.some((word) => !englishWords.has(word)) ||
        !question.options.includes(words[question.position - 1]),
    )
  )
    throw new Error("备份验证信息无效，请重新打开创建流程");
  const complete = questions.every((question) =>
    question.options.includes(answers[question.position]),
  );
  const incorrect = questions
    .filter(
      (question) => answers[question.position] !== words[question.position - 1],
    )
    .map((question) => question.position);
  return { complete, correct: complete && incorrect.length === 0, incorrect };
}

export function createMnemonicBackup(
  phrase: string,
  walletName = "钱包",
  accountIndex = 0,
) {
  if (
    !Number.isInteger(accountIndex) ||
    accountIndex < 0 ||
    accountIndex > 2 ** 31 - 1
  )
    throw new Error("账户序号无效");
  const words = mnemonicWords(phrase);
  const name = walletName.replace(/[\r\n\t]+/g, " ").trim() || "钱包";
  const fileName = name.replace(/[<>:"/\\|?*\u0000-\u001f]/g, "-").slice(0, 50);
  return {
    filename: `quantus-mnemonic-${fileName}.txt`,
    text: `${PROJECT_NAME} · 助记词备份\n钱包：${name}\n账户类型：ML-DSA-87\n账户序号：${accountIndex}\n派生路径：m/44'/189189'/${accountIndex}'/0'/0'\n\n助记词（${words.length} 个单词）：\n${words.join(" ")}\n\n这是未加密的助记词文件。请离线保管，不要分享给任何人。\n`,
  };
}

export function downloadMnemonicBackup(
  phrase: string,
  walletName?: string,
  accountIndex = 0,
) {
  const backup = createMnemonicBackup(phrase, walletName, accountIndex);
  download(backup.text, backup.filename, "text/plain;charset=utf-8");
}
