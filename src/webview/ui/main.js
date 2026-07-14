// @ts-check
(function () {
  const vscode = acquireVsCodeApi();

  const el = (id) => /** @type {any} */ (document.getElementById(id));
  const tabCurl = el('tab-curl');
  const tabJson = el('tab-json');
  const paneCurl = el('pane-curl');
  const paneJson = el('pane-json');
  const curl = el('curl');
  const json = el('json');
  const sendButton = el('send');
  const useJsonButton = el('use-json');
  const status = el('status');
  const responseBlock = el('response-block');
  const responseLabel = el('response-label');
  const responseBody = el('response');
  const headersDetails = el('headers-details');
  const headersBlock = el('headers');
  const meta = el('meta');
  const generateBlock = el('generate-block');
  const className = el('class-name');
  const language = el('language');
  const generateButton = el('generate');
  const modelBlock = el('model-block');
  const modelLabel = el('model-label');
  const modelBody = el('model');
  const errorBox = el('error');

  // Survives the panel being hidden and re-shown.
  const saved = vscode.getState() || {};
  curl.value = saved.curl || '';
  json.value = saved.json || '';
  className.value = saved.className || '';
  let mode = saved.mode === 'json' ? 'json' : 'curl';

  const persist = () =>
    vscode.setState({ curl: curl.value, json: json.value, className: className.value, mode });

  const showError = (message) => {
    errorBox.textContent = message;
    errorBox.hidden = false;
  };
  const clearError = () => {
    errorBox.hidden = true;
  };

  const resetOutput = () => {
    responseBlock.hidden = true;
    generateBlock.hidden = true;
    modelBlock.hidden = true;
    status.textContent = '';
  };

  const setMode = (next) => {
    mode = next;
    const isCurl = next === 'curl';

    tabCurl.classList.toggle('active', isCurl);
    tabJson.classList.toggle('active', !isCurl);
    tabCurl.setAttribute('aria-selected', String(isCurl));
    tabJson.setAttribute('aria-selected', String(!isCurl));
    paneCurl.hidden = !isCurl;
    paneJson.hidden = isCurl;

    // The two inputs produce different JSON, so anything on screen is now stale.
    clearError();
    resetOutput();
    persist();
    (isCurl ? curl : json).focus();
  };

  const submit = () => {
    clearError();
    if (mode === 'curl') {
      if (!curl.value.trim()) {
        showError('Paste a cURL command first.');
        return;
      }
      sendButton.disabled = true;
      vscode.postMessage({ type: 'send', curl: curl.value });
      return;
    }
    if (!json.value.trim()) {
      showError('Paste a JSON response first.');
      return;
    }
    vscode.postMessage({ type: 'json', text: json.value });
  };

  const generate = () => {
    clearError();
    if (!className.value.trim()) {
      showError('Enter a root class name, e.g. LoadDocument.');
      className.focus();
      return;
    }
    vscode.postMessage({
      type: 'generate',
      rootClassName: className.value,
      language: language.value,
    });
  };

  const afterJson = (message, isLive) => {
    responseLabel.textContent = isLive ? 'Response' : 'JSON';
    headersDetails.hidden = !isLive;
    responseBlock.hidden = false;
    generateBlock.hidden = !message.canGenerate;

    if (!message.canGenerate) {
      showError('The JSON root must be an object. Arrays and primitives are not supported yet.');
    }
  };

  tabCurl.addEventListener('click', () => setMode('curl'));
  tabJson.addEventListener('click', () => setMode('json'));
  sendButton.addEventListener('click', submit);
  useJsonButton.addEventListener('click', submit);
  generateButton.addEventListener('click', generate);

  curl.addEventListener('input', persist);
  json.addEventListener('input', persist);
  className.addEventListener('input', persist);

  className.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') {
      generate();
    }
  });
  for (const input of [curl, json]) {
    input.addEventListener('keydown', (event) => {
      if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') {
        submit();
      }
    });
  }

  el('copy').addEventListener('click', () =>
    vscode.postMessage({ type: 'copy', text: modelBody.textContent }),
  );
  el('insert').addEventListener('click', () =>
    vscode.postMessage({ type: 'insert', text: modelBody.textContent }),
  );
  el('save').addEventListener('click', () =>
    vscode.postMessage({ type: 'save', text: modelBody.textContent }),
  );

  window.addEventListener('message', (event) => {
    const message = event.data;

    switch (message.type) {
      case 'requestSend':
        submit();
        break;

      case 'requestGenerate':
        if (generateBlock.hidden) {
          showError(
            mode === 'curl'
              ? 'Send a request that returns JSON first.'
              : 'Load a JSON object first.',
          );
        } else {
          className.focus();
        }
        break;

      case 'sending':
        status.textContent = `${message.method} ${message.url} …`;
        break;

      case 'response': {
        sendButton.disabled = false;
        status.textContent = '';
        clearError();

        const tone = message.status >= 200 && message.status < 300 ? 'ok' : 'bad';
        meta.innerHTML = '';
        const code = document.createElement('span');
        code.className = tone;
        code.textContent = `${message.status} ${message.statusText}`.trim();
        meta.appendChild(code);
        meta.appendChild(document.createTextNode(` · ${message.durationMs} ms`));

        responseBody.textContent = message.body || '(empty response)';
        headersBlock.textContent = Object.entries(message.headers)
          .map(([key, value]) => `${key}: ${value}`)
          .join('\n');

        afterJson(message, true);
        if (!message.isJson) {
          showError('The response is not valid JSON, so a model cannot be generated from it.');
        }
        break;
      }

      case 'jsonLoaded':
        clearError();
        meta.textContent = '';
        responseBody.textContent = message.body;
        afterJson(message, false);
        break;

      case 'model':
        clearError();
        modelLabel.textContent = `${message.language} model`;
        modelBody.textContent = message.code;
        modelBlock.hidden = false;
        modelBlock.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        break;

      case 'error':
        sendButton.disabled = false;
        status.textContent = '';
        if (message.stage !== 'generate') {
          resetOutput();
        }
        showError(message.message);
        break;
    }
  });

  setMode(mode);
})();
