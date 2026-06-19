/* Abstractive generation — a REAL small LLM running fully in the browser.
 *
 * The hand-rolled baby net (neural-engine.js) can only RE-RANK real sentences;
 * it cannot write fluent, faithful Japanese. For true abstractive answers we run
 * a pre-trained small instruction model (≈0.5B, e.g. Qwen2.5-0.5B-Instruct) with
 * transformers.js on WebGPU — on-device inference, NO external AI API, NO key.
 *
 * Self-hosted only (外部取得ゼロ): the library and the quantized weights are
 * served from THIS origin (assets/vendor/transformers/, assets/models/…), and
 * transformers.js is configured with allowRemoteModels=false so it never reaches
 * out to a CDN. See assets/models/README.md for how to vendor the weights.
 *
 * Everything is gated by available(): false unless WebGPU exists AND the weights
 * are present. So with nothing vendored this module is a pure no-op and Ask falls
 * back to the existing search+extraction answer — zero behaviour change.
 */
(function (NSCode) {
  'use strict';

  var CFG = {
    libUrl: 'assets/vendor/transformers/transformers.min.js', // self-hosted ESM build
    wasmPath: 'assets/vendor/transformers/',                  // onnxruntime-web .wasm
    modelBase: 'assets/models/',                              // base dir (env.localModelPath)
    modelId: 'qwen2.5-0.5b-instruct-onnx',                    // folder under assets/models/
    dtype: 'q4f16',                                           // 4-bit weights (smallest that's decent)
    device: 'webgpu',
    maxTokens: 220, temperature: 0.4
  };

  var _pipe = null, _loading = null, _libOk = null, _present = null;

  function hasWebGPU() { return typeof navigator !== 'undefined' && !!navigator.gpu; }

  /* weights present? (HEAD/GET the model's config.json on this origin) */
  function modelPresent() {
    if (_present != null) return Promise.resolve(_present);
    return fetch(CFG.modelBase + CFG.modelId + '/config.json', { method: 'GET' })
      .then(function (r) { _present = !!(r && r.ok); return _present; })
      .catch(function () { _present = false; return false; });
  }

  /* generation is offered only when BOTH the GPU and the vendored weights exist */
  function available() { return hasWebGPU() ? modelPresent() : Promise.resolve(false); }

  function loadLib() {
    if (_libOk != null) return Promise.resolve(_libOk ? NSCode._tf : null);
    // native dynamic import of the self-hosted ESM bundle
    return import(/* @vite-ignore */ CFG.libUrl)
      .then(function (mod) { NSCode._tf = mod; _libOk = true; return mod; })
      .catch(function () { _libOk = false; return null; });
  }

  function load(onProgress) {
    if (_pipe) return Promise.resolve(_pipe);
    if (_loading) return _loading;
    _loading = available()
      .then(function (ok) { if (!ok) throw new Error('genllm unavailable (no WebGPU or no weights)'); return loadLib(); })
      .then(function (tf) {
        if (!tf) throw new Error('transformers.js not vendored');
        tf.env.allowRemoteModels = false;          // strict: never fetch from a remote CDN
        tf.env.allowLocalModels = true;
        tf.env.localModelPath = CFG.modelBase;
        try { tf.env.backends.onnx.wasm.wasmPaths = CFG.wasmPath; } catch (e) {}
        return tf.pipeline('text-generation', CFG.modelId, { device: CFG.device, dtype: CFG.dtype, progress_callback: onProgress });
      })
      .then(function (p) { _pipe = p; return p; })
      .catch(function (e) { _loading = null; throw e; });   // allow retry after a fix
    return _loading;
  }

  /* grounded prompt: answer ONLY from the retrieved passages (anti-hallucination) */
  function buildMessages(question, contexts) {
    var ctx = (contexts || []).slice(0, 4).map(function (c, i) { return '【資料' + (i + 1) + '】' + String(c || '').trim(); }).join('\n');
    return [
      { role: 'system', content: 'あなたは機械工学の専門アシスタントです。与えられた資料だけを根拠に、質問へ簡潔で正確な日本語で答えてください。資料に無い内容は推測せず「資料からは判断できません」と述べます。' },
      { role: 'user', content: '資料:\n' + ctx + '\n\n質問: ' + question + '\n\n上の資料に基づき、200字程度の日本語で答えてください。' }
    ];
  }

  function extractText(out) {
    var g = out && out[0] && out[0].generated_text;
    if (Array.isArray(g)) { var last = g[g.length - 1]; return ((last && last.content) || '').trim(); }   // chat format
    return String(g || '').trim();
  }

  function generate(messages, opts) {
    opts = opts || {};
    return load(opts.onProgress).then(function (p) {
      return p(messages, {
        max_new_tokens: opts.maxTokens || CFG.maxTokens,
        temperature: opts.temperature == null ? CFG.temperature : opts.temperature,
        do_sample: true, top_k: 40, repetition_penalty: 1.2
      });
    }).then(extractText);
  }

  /* RAG-grounded abstractive answer from retrieved passages -> Promise<string> */
  function answerRAG(question, contexts, opts) {
    return generate(buildMessages(question, contexts), opts);
  }

  NSCode.genllm = {
    available: available, hasWebGPU: hasWebGPU, modelPresent: modelPresent,
    load: load, generate: generate, answerRAG: answerRAG, config: CFG
  };
})(window.NSCode);
