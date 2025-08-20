async function callGeminiAPI(prompt) {
    const apiKey = ""; 
    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-05-20:generateContent?key=${apiKey}`;
    const payload = {
        contents: [{
            role: "user",
            parts: [{ text: prompt }]
        }]
    };

    try {
        const response = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        if (!response.ok) {
            const errorBody = await response.text();
            console.error("API Error Response:", errorBody);
            throw new Error(`API Error: ${response.status} ${response.statusText}`);
        }
        const result = await response.json();
        if (result.candidates && result.candidates.length > 0 && result.candidates[0].content.parts[0].text) {
            return result.candidates[0].content.parts[0].text;
        }
        console.error("Unexpected API response structure:", result);
        return "AIからの応答形式が正しくありません。";
    } catch (error) {
        console.error("Gemini API call failed:", error);
        return "AIの呼び出し中にエラーが発生しました。";
    }
}

async function handleSuggestName() {
    const originalText = dom.suggestNameBtn.innerHTML;
    dom.suggestNameBtn.innerHTML = '<div class="spinner w-5 h-5 mx-auto"></div>';
    dom.suggestNameBtn.disabled = true;

    const prompt = `海底ケーブルの測量作業をしています。現在記録する測点のデフォルト名は「ポイント ${recordedPoints.length + 1}」です。これに基づいた、簡潔で実用的な測点名を3つ提案してください。例えば、「KP-${recordedPoints.length + 1}」や「調査点-${recordedPoints.length + 1}」のような形式です。提案のみを改行で区切って回答してください。`;
    const suggestion = await callGeminiAPI(prompt);
    const firstSuggestion = suggestion.split('\n')[0].replace(/[-* ]/g, '');
    dom.pointNameInput.value = firstSuggestion;

    dom.suggestNameBtn.innerHTML = originalText;
    dom.suggestNameBtn.disabled = false;
}

async function handleGenerateReport() {
    dom.reportModal.classList.add('is-open');
    dom.reportContent.innerHTML = '<div class="flex justify-center items-center h-full"><div class="spinner"></div></div>';
    dom.copyReportBtn.disabled = true;

    const date = new Date().toLocaleDateString('ja-JP', { year: 'numeric', month: 'long', day: 'numeric' });
    const pointsSummary = recordedPoints.map(p => {
        const time = new Date(p.timestamp).toLocaleTimeString('ja-JP');
        return `  - ${time}: ${p.name} (緯度: ${p.lat.toFixed(6)}, 経度: ${p.lon.toFixed(6)}, 精度: ${p.acc.toFixed(1)}m, ステータス: ${p.status})`;
    }).join('\n');
    
    const prompt = `
        あなたは建設コンサルタントです。以下の測量データに基づいて、プロフェッショナルな作業日報を作成してください。

        # 作業情報
        - **作業内容**: 海底ケーブル敷設ルートの測量
        - **作業日**: ${date}

        # 記録済みポイント
        ${pointsSummary.length > 0 ? pointsSummary : '記録されたポイントはありません。'}

        # 指示
        上記の情報から、以下の項目を含む簡潔で分かりやすい作業日報を作成してください。
        1. **作業概要**: いつ、どのような作業を何点行ったかをまとめる。
        2. **作業内容**: 記録したポイントを時系列でリストアップする。
        3. **所感・特記事項**: データから推測できること（例えば、作業が順調に進んだ、特定のエリアで集中して作業した、GNSSの受信状況など）を記述する。

        形式は丁寧なビジネス文書でお願いします。Markdown形式で記述してください。
    `;

    const reportText = await callGeminiAPI(prompt);
    dom.reportContent.innerHTML = `<textarea class="w-full h-full bg-gray-100 border-none resize-none p-2" readonly>${reportText}</textarea>`;
    dom.copyReportBtn.disabled = false;
}

function copyReportToClipboard() {
    const reportTextArea = dom.reportContent.querySelector('textarea');
    if (reportTextArea) {
        if (navigator.clipboard && navigator.clipboard.writeText) {
            navigator.clipboard.writeText(reportTextArea.value).then(() => {
                alert('日報をクリップボードにコピーしました。');
            }).catch(err => {
                console.error('コピーに失敗しました: ', err);
                fallbackCopyTextToClipboard(reportTextArea.value);
            });
        } else {
            fallbackCopyTextToClipboard(reportTextArea.value);
        }
    }
}

function fallbackCopyTextToClipboard(text) {
    const textArea = document.createElement("textarea");
    textArea.value = text;
    textArea.style.top = "0";
    textArea.style.left = "0";
    textArea.style.position = "fixed";
    document.body.appendChild(textArea);
    textArea.focus();
    textArea.select();
    try {
        const successful = document.execCommand('copy');
        if (successful) {
            alert('日報をクリップボードにコピーしました。');
        } else {
            alert('コピーに失敗しました。');
        }
    } catch (err) {
        console.error('Fallback: コピーできませんでした', err);
        alert('コピーに失敗しました。');
    }
    document.body.removeChild(textArea);
}
