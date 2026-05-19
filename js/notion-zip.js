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

  async function parseFile(file, opts = {}) {
    const maxChars = opts.maxChars || 80000; // AI 토큰 한도 안전 마진
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

    // 상위 경로 먼저 (메인 페이지가 위로)
    entries.sort((a, b) => {
      const da = a.path.split('/').length, db = b.path.split('/').length;
      if (da !== db) return da - db;
      return a.path.localeCompare(b.path);
    });

    // 합치되 길이 제한 (가장 상위 페이지부터 우선 포함)
    let total = '';
    const includedPaths = [];
    let truncated = false;
    for (const e of entries) {
      const header = `\n\n========== ${e.ext.toUpperCase()} :: ${cleanName(e.path)} ==========\n`;
      const block = header + e.text.trim();
      if (total.length + block.length > maxChars) {
        if (!truncated) {
          total += `\n\n[... 이후 ${entries.length - includedPaths.length}개 파일은 길이 제한으로 생략됨 ...]`;
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

  window.NotionZip = {
    enabled: true,
    parseFile,
    cleanName,
  };
})();
