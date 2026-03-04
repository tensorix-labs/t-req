export const parsers = [
  {
    filetype: 'json',
    wasm: 'https://github.com/tree-sitter/tree-sitter-json/releases/download/v0.24.8/tree-sitter-json.wasm',
    queries: {
      highlights: [
        'https://raw.githubusercontent.com/nvim-treesitter/nvim-treesitter/refs/heads/master/queries/json/highlights.scm'
      ]
    }
  },
  {
    filetype: 'html',
    wasm: 'https://github.com/tree-sitter/tree-sitter-html/releases/download/v0.23.2/tree-sitter-html.wasm',
    queries: {
      highlights: [
        'https://github.com/tree-sitter/tree-sitter-html/raw/refs/heads/master/queries/highlights.scm'
      ]
    }
  },
  {
    filetype: 'yaml',
    wasm: 'https://github.com/tree-sitter-grammars/tree-sitter-yaml/releases/download/v0.7.2/tree-sitter-yaml.wasm',
    queries: {
      highlights: [
        'https://raw.githubusercontent.com/nvim-treesitter/nvim-treesitter/refs/heads/master/queries/yaml/highlights.scm'
      ]
    }
  }
];
