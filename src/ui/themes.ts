/** 每个主题必须定义完全相同的变量集合，缺一个就会露出上一个主题的颜色。 */
export const THEMES: Record<string, Record<string, string>> = {
  'tokyo-night': {
    '--bg': '#1a1b26', '--fg': '#c0caf5', '--cursor': '#c0caf5', '--prompt': '#9ece6a',
    '--red': '#f7768e', '--green': '#9ece6a', '--yellow': '#e0af68',
    '--blue': '#7aa2f7', '--magenta': '#bb9af7', '--cyan': '#7dcfff',
    '--selection': '#33467c',
  },
  dracula: {
    '--bg': '#282a36', '--fg': '#f8f8f2', '--cursor': '#f8f8f2', '--prompt': '#50fa7b',
    '--red': '#ff5555', '--green': '#50fa7b', '--yellow': '#f1fa8c',
    '--blue': '#bd93f9', '--magenta': '#ff79c6', '--cyan': '#8be9fd',
    '--selection': '#44475a',
  },
  nord: {
    '--bg': '#2e3440', '--fg': '#d8dee9', '--cursor': '#d8dee9', '--prompt': '#a3be8c',
    '--red': '#bf616a', '--green': '#a3be8c', '--yellow': '#ebcb8b',
    '--blue': '#81a1c1', '--magenta': '#b48ead', '--cyan': '#88c0d0',
    '--selection': '#434c5e',
  },
  gruvbox: {
    '--bg': '#282828', '--fg': '#ebdbb2', '--cursor': '#ebdbb2', '--prompt': '#b8bb26',
    '--red': '#fb4934', '--green': '#b8bb26', '--yellow': '#fabd2f',
    '--blue': '#83a598', '--magenta': '#d3869b', '--cyan': '#8ec07c',
    '--selection': '#504945',
  },
  'one-dark': {
    '--bg': '#282c34', '--fg': '#abb2bf', '--cursor': '#abb2bf', '--prompt': '#98c379',
    '--red': '#e06c75', '--green': '#98c379', '--yellow': '#e5c07b',
    '--blue': '#61afef', '--magenta': '#c678dd', '--cyan': '#56b6c2',
    '--selection': '#3e4451',
  },
}

export const DEFAULT_THEME = 'tokyo-night'
export const THEME_STORAGE_KEY = 'terminal-theme'
