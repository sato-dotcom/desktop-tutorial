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

