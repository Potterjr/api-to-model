// @ts-check
(function () {
  const vscode = acquireVsCodeApi();

  const el = (id) => /** @type {any} */ (document.getElementById(id));
  const curl = el('curl');
  const sendButton = el('send');
  const status = el('status');
  const responseBlock = el('response-block');
  const responseBody = el('response');
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
  className.value = saved.className || '';

  const persist = () => vscode.setState({ curl: curl.value, className: className.value });
  curl.addEventListener('input', persist);
  className.addEventListener('input', persist);

  const showError = (message) => {
    errorBox.textContent = message;
    errorBox.hidden = false;
  };
  const clearError = () => {
    errorBox.hidden = true;
  };

  const send = () => {
    clearError();
    if (!curl.value.trim()) {
      showError('Paste a cURL command first.');
      return;
    }
    sendButton.disabled = true;
    vscode.postMessage({ type: 'send', curl: curl.value });
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

  sendButton.addEventListener('click', send);
  generateButton.addEventListener('click', generate);
  className.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') {
      generate();
    }
  });
  curl.addEventListener('keydown', (event) => {
    if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') {
      send();
    }
  });

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
        send();
        break;

      case 'requestGenerate':
        if (generateBlock.hidden) {
          showError('Send a request that returns JSON first.');
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
        responseBlock.hidden = false;

        generateBlock.hidden = !message.canGenerate;
        if (!message.isJson) {
          showError('The response is not valid JSON, so a model cannot be generated from it.');
        } else if (!message.canGenerate) {
          showError('The JSON root must be an object. Arrays and primitives are not supported yet.');
        }
        break;
      }

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
          responseBlock.hidden = true;
          generateBlock.hidden = true;
          modelBlock.hidden = true;
        }
        showError(message.message);
        break;
    }
  });
})();
