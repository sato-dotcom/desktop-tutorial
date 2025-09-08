// ... existing code ... -->
    const firstSuggestion = suggestion.split('\n')[0].replace(/[-* ]/g, '');
    dom.pointNameInput.value = firstSuggestion;

    dom.suggestNameBtn.innerHTML = originalText;
    dom.suggestNameBtn.disabled = false;
}
