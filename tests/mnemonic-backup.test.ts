import { describe, expect, it, spyOn } from "bun:test";
import { entropyToMnemonic } from "@scure/bip39";
import { wordlist } from "@scure/bip39/wordlists/english.js";
import {
  checkMnemonicQuiz,
  createMnemonicBackup,
  createMnemonicQuiz,
  type MnemonicAnswers,
} from "../src/lib/mnemonic-backup";

// Public deterministic fixtures; no user wallet data is used in these tests.
const phrase = entropyToMnemonic(
  Uint8Array.from({ length: 32 }, (_, index) => index),
  wordlist,
);
const words = phrase.split(" ");

function withRandomValues(
  values: number[],
  action: (calls: () => number) => void,
) {
  let calls = 0;
  const random = spyOn(crypto, "getRandomValues").mockImplementation(((
    array,
  ) => {
    (array as Uint32Array)[0] = values[calls++ % values.length];
    return array;
  }) as typeof crypto.getRandomValues);
  try {
    action(() => calls);
  } finally {
    random.mockRestore();
  }
}

describe("mnemonic backup verification", () => {
  it("chooses three separate positions with four unique English candidates each", () => {
    for (let attempt = 0; attempt < 20; attempt++) {
      const questions = createMnemonicQuiz(phrase);
      expect(questions.length).toBe(3);
      expect(new Set(questions.map((question) => question.position)).size).toBe(
        3,
      );
      for (const question of questions) {
        expect(question.position >= 1 && question.position <= 24).toBe(true);
        expect(question.options.length).toBe(4);
        expect(new Set(question.options).size).toBe(4);
        expect(question.options.every((word) => wordlist.includes(word))).toBe(
          true,
        );
        expect(
          question.options.filter(
            (word) => word === words[question.position - 1],
          ).length,
        ).toBe(1);
      }
    }
  });

  it("uses secure random values for both question positions and correct-option order", () => {
    let firstQuestions = "";
    let firstCorrectOption = -1;
    const weakRandom = spyOn(Math, "random").mockImplementation(() => {
      throw new Error("Weak random source used");
    });
    try {
      withRandomValues([0], () => {
        const questions = createMnemonicQuiz(phrase);
        firstQuestions = questions
          .map((question) => question.position)
          .join(",");
        firstCorrectOption = questions[0].options.indexOf(
          words[questions[0].position - 1],
        );
      });
      withRandomValues([1], () => {
        const questions = createMnemonicQuiz(phrase);
        expect(
          questions.map((question) => question.position).join(","),
        ).not.toBe(firstQuestions);
        expect(
          questions[0].options.indexOf(words[questions[0].position - 1]),
        ).not.toBe(firstCorrectOption);
      });
    } finally {
      weakRandom.mockRestore();
    }
  });

  it("rejects the biased tail of random values instead of using modulo directly", () => {
    const values = [
      0xffff_ffff,
      ...Array.from({ length: 40 }, (_, index) => index),
    ];
    withRandomValues(values, (calls) => {
      const questions = createMnemonicQuiz(phrase);
      expect(questions.map((question) => question.position)).toEqual([1, 3, 5]);
      expect(calls()).toBe(25);
    });
  });

  it("starts unanswered and allows a wrong selection to be corrected on the same questions", () => {
    const questions = createMnemonicQuiz(phrase);
    const original = structuredClone(questions);
    const answers: MnemonicAnswers = {};
    expect(checkMnemonicQuiz(phrase, questions, answers)).toEqual({
      complete: false,
      correct: false,
      incorrect: questions.map((question) => question.position),
    });
    for (const question of questions)
      answers[question.position] = words[question.position - 1];
    const changed = questions[1];
    answers[changed.position] = changed.options.find(
      (word) => word !== words[changed.position - 1],
    )!;
    expect(checkMnemonicQuiz(phrase, questions, answers)).toEqual({
      complete: true,
      correct: false,
      incorrect: [changed.position],
    });
    answers[changed.position] = words[changed.position - 1];
    expect(checkMnemonicQuiz(phrase, questions, answers)).toEqual({
      complete: true,
      correct: true,
      incorrect: [],
    });
    expect(questions).toEqual(original);
  });

  it("does not accept omitted questions, repeated positions or malformed candidate sets", () => {
    const questions = createMnemonicQuiz(phrase);
    expect(() => checkMnemonicQuiz(phrase, [], {})).toThrow("验证信息无效");
    expect(() =>
      checkMnemonicQuiz(phrase, [questions[0], questions[0], questions[2]], {}),
    ).toThrow("验证信息无效");
    const duplicates = structuredClone(questions);
    duplicates[0].options[1] = duplicates[0].options[0];
    expect(() => checkMnemonicQuiz(phrase, duplicates, {})).toThrow(
      "验证信息无效",
    );
    const outOfRange = structuredClone(questions);
    outOfRange[0].position = 25;
    expect(() => checkMnemonicQuiz(phrase, outOfRange, {})).toThrow(
      "验证信息无效",
    );
  });

  it("handles repeated words in a valid mnemonic without duplicate candidates", () => {
    const repeatedPhrase = entropyToMnemonic(new Uint8Array(32), wordlist);
    const repeatedWords = repeatedPhrase.split(" ");
    const questions = createMnemonicQuiz(repeatedPhrase);
    const answers = Object.fromEntries(
      questions.map((question) => [
        question.position,
        repeatedWords[question.position - 1],
      ]),
    );
    expect(checkMnemonicQuiz(repeatedPhrase, questions, answers).correct).toBe(
      true,
    );
    expect(
      questions.every((question) => new Set(question.options).size === 4),
    ).toBe(true);
  });

  it("exports all words in order with a clear plaintext label and a safe filename", () => {
    const backup = createMnemonicBackup(
      "  " + phrase.toUpperCase().replaceAll(" ", "\n") + "  ",
      "旅行/钱包\n备份",
    );
    expect(backup.filename).toBe("quantus-mnemonic-旅行-钱包 备份.txt");
    expect(backup.text).toContain("助记词备份");
    expect(backup.text).toContain("24 个单词");
    expect(backup.text).toContain("未加密");
    expect(backup.text.split("\n").filter((line) => line === phrase)).toEqual([
      phrase,
    ]);
    expect(() => createMnemonicBackup("invalid words")).toThrow("助记词无效");
  });

  it("preserves a non-default account index so an imported wallet can be recovered", () => {
    const backup = createMnemonicBackup(phrase, "Imported account", 7, "mldsa87");
    expect(backup.text).toContain("账户类型：ML-DSA-87");
    expect(backup.text).toContain("账户序号：7");
    expect(backup.text).toContain("m/44'/189189'/7'/0'/0'");
    expect(() => createMnemonicBackup(phrase, "Invalid", -1)).toThrow();
  });

  it("records the ML-DSA-65 scheme and its official path component", () => {
    const backup = createMnemonicBackup(phrase, "Official wallet", 2, "mldsa65");
    expect(backup.text).toContain("账户类型：ML-DSA-65");
    expect(backup.text).toContain("账户序号：2");
    expect(backup.text).toContain("m/44'/189189'/2'/0'/1'");
    expect(backup.text).not.toContain("ML-DSA-87");
  });

  it("can export an imported shorter mnemonic while new-wallet verification requires 24 words", () => {
    const importedPhrase = entropyToMnemonic(new Uint8Array(16), wordlist);
    expect(createMnemonicBackup(importedPhrase).text).toContain("12 个单词");
    expect(() => createMnemonicQuiz(importedPhrase)).toThrow("24 词");
  });
});
