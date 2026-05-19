// js/notion-zip.js — 노션 export ZIP 파서
// 노션 → ⋯ → 내보내기 → "Markdown & CSV" 다운로드 한 ZIP을 받아서
// 모든 .md / .csv 파일 내용을 추출하고 AI에 넘길 수 있는 단일 텍스트로 합칩니다.
//
// 노션 ZIP 구조 예:
//   2027_유럽 10000Km 여행 abc123.md          ← 메인 페이지
//   2027_유럽 10000Km 여행 abc123/
//     유럽 여행 계획 def456.csv               ← 데이터베이스 export
//     유럽 여행 계획 def456/
//       Day 1 ghi789.md                     ← 개별 페이지
//       ...
//     image.png                              ← 이미지 (skip)
//
// 노션에 절대 쓰지 않습니다 (read-only).
(function () {
  if (!window.JSZip) {
    console.warn('[notion-zip] JSZip not loaded');
    window.NotionZip = { enabled: false };
    return;
  }

  // 파일명에서 32자리 노션 해시 제거 (가독성)
  function cleanName(path) {
    return path
      .replace(/ [0-9a-f]{32}(\.(md|csv))?$/i, '$1')
      .replace(/ [0-9a-f]{32}(\/)/gi, '$1');
  }

  // ZIP에서 모든 .md/.csv 파일을 추출
  async function extractEntries(file) {
    const zip = await JSZip.loadAsync(file);
    const entries = [];
    for (const [path, entry] of Object.entries(zip.files)) {
      if (entry.dir) continue;
      const lower = path.toLowerCase();
      if (lower.endsWith('.md') || lower.endsWith('.csv')) {
        const text = await entry.async('string');
        entries.push({ path, text, ext: lower.endsWith('.csv') ? 'csv' : 'md' });
      }
    }
    // 상위 경로 먼저, 같은 깊이면 알파벳
    entries.sort((a, b) => {
      const da = a.path.split('/').length, db = b.path.split('/').length;
      if (da !== db) return da - db;
      return a.path.localeCompare(b.path);
    });
    return entries;
  }

  // 단일 결합 텍스트 (제한 적용). 기존 호환.
  async function parseFile(file, opts = {}) {
    const maxChars = opts.maxChars || 200000; // Gemini 2.5 Flash 1M context — 안전 마진 확대
    const entries = await extractEntries(file);
    let total = '';
    const includedPaths = [];
    let truncated = false;
    for (const e of entries) {
      const header = `\n\n========== ${e.ext.toUpperCase()} :: ${cleanName(e.path)} ==========\n`;
      const block = header + e.text.trim();
      if (total.length + block.length > maxChars) {
        if (!truncated) {
          total += `\n\n[... 이후 ${entries.length - includedPaths.length}개 파일은 길이 제한으로 생략됨 — 큰 export는 chunkFile() 사용 ...]`;
          truncated = true;
        }
        continue;
      }
      total += block;
      includedPaths.push(cleanName(e.path));
    }
    return {
      combinedText: total.trim(),
      fileCount: entries.length,
      includedCount: includedPaths.length,
      truncated,
      includedPaths,
    };
  }

  // 큰 export를 의미 단위로 청크 분할
  // 전략:
  //   1) 메인 페이지(.md, 깊이 1) 따로
  //   2) 각 데이터베이스(.csv + 같은 이름 폴더) 한 청크
  //   3) 나머지 페이지들을 합쳐서 청크
  async function chunkFile(file, opts = {}) {
    const chunkMax = opts.chunkMax || 80000;
    const entries = await extractEntries(file);
    if (entries.length === 0) return { chunks: [], fileCount: 0 };

    // 메인 페이지 (가장 얕은 .md)
    const mainPage = entries.find(e => e.ext === 'md' && e.path.split('/').length === 1);

    // CSV 파일들 (데이터베이스)
    const csvFiles = entries.filter(e => e.ext === 'csv');

    // CSV별로 같은 이름의 폴더 안에 있는 .md 파일들을 묶음
    function relatedMds(csvPath) {
      // CSV: "유럽 여행 계획 def456.csv"
      // 폴더: "유럽 여행 계획 def456/"
      const folder = csvPath.replace(/\.csv$/i, '/');
      return entries.filter(e => e.ext === 'md' && e.path.startsWith(folder));
    }

    const chunks = [];

    if (mainPage) {
      chunks.push({
        label: '메인 페이지',
        text: `========== MAIN PAGE :: ${cleanName(mainPage.path)} ==========\n${mainPage.text.trim()}`,
      });
    }

    csvFiles.forEach(csv => {
      const related = relatedMds(csv.path);
      let block = `========== DATABASE :: ${cleanName(csv.path)} ==========\n${csv.text.trim()}`;
      for (const r of related) {
        const part = `\n\n---- ${cleanName(r.path)} ----\n${r.text.trim()}`;
        if (block.length + part.length > chunkMax) break;
        block += part;
      }
      chunks.push({ label: 'DB: ' + cleanName(csv.path).replace(/\.csv$/, ''), text: block });
    });

    // 나머지 (메인도 아니고 CSV 폴더에도 안 속한) .md
    const csvFolders = csvFiles.map(c => c.path.replace(/\.csv$/i, '/'));
    const orphans = entries.filter(e =>
      e.ext === 'md' && e !== mainPage &&
      !csvFolders.some(folder => e.path.startsWith(folder))
    );
    let buf = '';
    orphans.forEach(o => {
      const block = `\n\n---- ${cleanName(o.path)} ----\n${o.text.trim()}`;
      if (buf.length + block.length > chunkMax) {
        if (buf) chunks.push({ label: '기타 페이지', text: buf.trim() });
        buf = block;
      } else {
        buf += block;
      }
    });
    if (buf) chunks.push({ label: '기타 페이지', text: buf.trim() });

    return { chunks, fileCount: entries.length };
  }

  window.NotionZip = {
    enabled: true,
    parseFile,
    chunkFile,
    cleanName,
  };
})();
