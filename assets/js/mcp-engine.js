/* NSCode MCP engine — offline, deterministic helpers for the MCP Lab.
 * No backend / no real transport: toConfig() serializes a server spec to an
 * MCP-style config, and handshake() produces a deterministic, SIMULATED
 * JSON-RPC message trace (initialize → tools/list → tools/call). */
(function (NSCode) {
  'use strict';

  var PROTOCOL_VERSION = '2024-11-05';

  /* ---------- helpers ---------- */
  function pretty(obj) { return JSON.stringify(obj, null, 2); }

  function sampleArg(type) {
    switch (String(type || 'string')) {
      case 'number': return 42;
      case 'integer': return 42;
      case 'boolean': return true;
      case 'array': return [];
      case 'object': return {};
      default: return 'sample';
    }
  }

  function inputSchema(params) {
    var props = {}, required = [];
    (params || []).forEach(function (p) {
      if (!p || !p.name) return;
      props[p.name] = { type: p.type || 'string' };
      required.push(p.name);
    });
    var schema = { type: 'object', properties: props };
    if (required.length) schema.required = required;
    return schema;
  }

  /* ---------- toConfig(spec) -> JSON string ---------- */
  function toConfig(spec) {
    spec = spec || {};
    var config = {
      name: spec.name || 'mcp-server',
      protocolVersion: PROTOCOL_VERSION,
      capabilities: {
        tools: { listChanged: false },
        resources: { subscribe: false, listChanged: false },
        prompts: { listChanged: false }
      },
      tools: (spec.tools || []).map(function (t) {
        return {
          name: t.name,
          description: t.description || '',
          inputSchema: inputSchema(t.params)
        };
      }),
      resources: (spec.resources || []).map(function (r) {
        return { uri: r.uri, name: r.name };
      }),
      prompts: (spec.prompts || []).map(function (p) {
        return {
          name: p.name,
          arguments: (p.args || []).map(function (a) {
            return { name: a, required: false };
          })
        };
      })
    };
    return pretty(config);
  }

  /* ---------- handshake(spec) -> array of message entries ---------- */
  function handshake(spec) {
    spec = spec || {};
    var name = spec.name || 'mcp-server';
    var tools = spec.tools || [];
    var msgs = [];

    function entry(dir, method, json) {
      return { dir: dir, method: method, json: pretty(json) };
    }

    /* 1) initialize */
    msgs.push(entry('→request', 'initialize', {
      jsonrpc: '2.0',
      id: 1,
      method: 'initialize',
      params: {
        protocolVersion: PROTOCOL_VERSION,
        capabilities: { roots: { listChanged: true }, sampling: {} },
        clientInfo: { name: 'NSCode MCP Lab', version: NSCode.version || '1.0.0' }
      }
    }));
    msgs.push(entry('←response', 'initialize', {
      jsonrpc: '2.0',
      id: 1,
      result: {
        protocolVersion: PROTOCOL_VERSION,
        capabilities: {
          tools: { listChanged: false },
          resources: { subscribe: false, listChanged: false },
          prompts: { listChanged: false }
        },
        serverInfo: { name: name, version: '1.0.0' }
      }
    }));

    /* 2) tools/list */
    msgs.push(entry('→request', 'tools/list', {
      jsonrpc: '2.0', id: 2, method: 'tools/list', params: {}
    }));
    msgs.push(entry('←response', 'tools/list', {
      jsonrpc: '2.0',
      id: 2,
      result: {
        tools: tools.map(function (t) {
          return {
            name: t.name,
            description: t.description || '',
            inputSchema: inputSchema(t.params)
          };
        })
      }
    }));

    /* 3) tools/call (first tool with sample args) */
    var first = tools[0];
    var callName = first ? first.name : 'echo';
    var args = {};
    if (first) (first.params || []).forEach(function (p) { if (p && p.name) args[p.name] = sampleArg(p.type); });

    msgs.push(entry('→request', 'tools/call', {
      jsonrpc: '2.0',
      id: 3,
      method: 'tools/call',
      params: { name: callName, arguments: args }
    }));
    msgs.push(entry('←response', 'tools/call', {
      jsonrpc: '2.0',
      id: 3,
      result: {
        content: [
          {
            type: 'text',
            text: 'Tool "' + callName + '" executed with arguments ' + JSON.stringify(args) + ' (simulated result).'
          }
        ],
        isError: false
      }
    }));

    return msgs;
  }

  NSCode.mcp = {
    PROTOCOL_VERSION: PROTOCOL_VERSION,
    toConfig: toConfig,
    handshake: handshake,
    inputSchema: inputSchema
  };
})(window.NSCode);
