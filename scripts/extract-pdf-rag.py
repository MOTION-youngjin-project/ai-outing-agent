import hashlib
import json
import re
import sys
from pathlib import Path

import pdfplumber

ROOT = Path(__file__).resolve().parents[1]
PDF_DIR = ROOT / "data" / "rag"
OUTPUT = PDF_DIR / "chunks.json"

DOCUMENTS = {
    "daegu-food-guide-2026.pdf": {
        "key": "daegu-food-guide-2026",
        "title": "2026 대구음식점 가이드북",
        "url": "https://www.daegufood.go.kr/kor/board/board.asp?board_id=6&idx=99&mode=cont",
        "type": "food_guide",
    },
    "daegu-tourism-db-guide.pdf": {
        "key": "daegu-tourism-db-guide",
        "title": "대구관광 DB자료집",
        "url": "https://tour.daegu.go.kr/index.do?menu_id=00002956",
        "type": "tourism_database_guide",
    },
    "daegu-subway-trip-guide.pdf": {
        "key": "daegu-subway-trip-guide",
        "title": "도시철도로 떠나는 대구 여행",
        "url": "https://tour.daegu.go.kr/file/7999575debef43ea8705141c1a7f7154.pdf",
        "type": "route_guide",
    },
}


def normalize(text: str) -> str:
    text = text.replace("\x00", " ")
    text = re.sub(r"[ \t]+", " ", text)
    text = re.sub(r"\n{3,}", "\n\n", text)
    return text.strip()


def split_text(text: str, max_chars: int = 1400, overlap: int = 180):
    if len(text) <= max_chars:
        return [text] if text else []
    parts = []
    start = 0
    while start < len(text):
        end = min(start + max_chars, len(text))
        if end < len(text):
            boundary = max(text.rfind("\n", start, end), text.rfind(". ", start, end))
            if boundary > start + max_chars // 2:
                end = boundary + 1
        chunk = text[start:end].strip()
        if chunk:
            parts.append(chunk)
        if end >= len(text):
            break
        start = max(end - overlap, start + 1)
    return parts


def main():
    result = {"documents": [], "chunks": []}
    for filename, meta in DOCUMENTS.items():
        path = PDF_DIR / filename
        if not path.exists():
            print(f"missing: {path}", file=sys.stderr)
            continue
        checksum = hashlib.sha256(path.read_bytes()).hexdigest()
        extracted_pages = 0
        with pdfplumber.open(path) as pdf:
            result["documents"].append({**meta, "filename": filename, "checksum": checksum, "pageCount": len(pdf.pages)})
            for page_no, page in enumerate(pdf.pages, start=1):
                text = normalize(page.extract_text(x_tolerance=2, y_tolerance=3) or "")
                if len(text) < 20:
                    continue
                extracted_pages += 1
                for part_no, chunk in enumerate(split_text(text)):
                    result["chunks"].append({
                        "documentKey": meta["key"],
                        "page": page_no,
                        "part": part_no,
                        "text": f"[문서: {meta['title']} | PDF 페이지 {page_no}]\n{chunk}",
                    })
        print(f"{filename}: {extracted_pages} pages extracted", file=sys.stderr)
    OUTPUT.write_text(json.dumps(result, ensure_ascii=False), encoding="utf-8")
    print(json.dumps({"documents": len(result["documents"]), "chunks": len(result["chunks"]), "output": str(OUTPUT)}, ensure_ascii=False))


if __name__ == "__main__":
    main()
