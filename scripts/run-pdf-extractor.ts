import "dotenv/config";
import { spawnSync } from "node:child_process";

type PythonCommand = { command: string; args: string[] };

const configuredPython = process.env.RAG_PYTHON?.trim();
const candidates: PythonCommand[] = [
  ...(configuredPython ? [{ command: configuredPython, args: [] }] : []),
  { command: "python3", args: [] },
  { command: "python", args: [] },
  ...(process.platform === "win32" ? [{ command: "py", args: ["-3"] }] : []),
];

function isUsablePython(candidate: PythonCommand) {
  const check = spawnSync(candidate.command, [...candidate.args, "-c", "import pdfplumber"], {
    encoding: "utf8",
    windowsHide: true,
  });
  return check.status === 0;
}

const python = candidates.find(isUsablePython);

if (!python) {
  console.error([
    "PDF RAG 추출에 사용할 Python 3과 pdfplumber를 찾지 못했습니다.",
    "Python 3 설치 후 다음 명령을 실행하세요:",
    "  python -m pip install -r requirements.txt",
    "Python 실행 파일이 PATH에 없다면 RAG_PYTHON 환경변수로 전체 경로를 지정할 수 있습니다.",
  ].join("\n"));
  process.exit(1);
}

const result = spawnSync(
  python.command,
  [...python.args, "scripts/extract-pdf-rag.py"],
  { stdio: "inherit", windowsHide: true },
);

if (result.error) {
  console.error(`PDF RAG 추출기를 실행하지 못했습니다: ${result.error.message}`);
  process.exit(1);
}

process.exit(result.status ?? 1);
