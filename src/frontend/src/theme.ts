import { createTheme } from '@mui/material/styles'

/** 三套字体栈，和原来 index.css 里的 --sans / --display / --mono 一致。 */
export const SANS =
  "'Noto Sans CJK SC', 'Source Han Sans SC', 'PingFang SC', 'Microsoft YaHei', system-ui, sans-serif"
export const DISPLAY =
  "'FangSong', 'STFangsong', 'AR PL UKai CN', 'Kaiti SC', 'Noto Serif CJK SC', serif"
export const MONO = "'Maple Mono NF CN', ui-monospace, 'Cascadia Mono', monospace"

/**
 * 纸墨主题：设计 token（纸色 / 墨色 / 印章红）全部集中在这里，
 * 页面里只写布局性的 sx，不再有自写的组件样式。
 */
export const theme = createTheme({
  palette: {
    mode: 'light',
    primary: {
      main: '#a63a25', // 印章红
      dark: '#862e1c',
      light: '#c25740',
      contrastText: '#fffdf8',
    },
    success: { main: '#2f6e58' },
    background: { default: '#f7f3ea', paper: '#fffdf8' },
    text: { primary: '#1e1b16', secondary: '#6f6557', disabled: '#a49a8a' },
    divider: '#e6dec9',
  },
  shape: { borderRadius: 10 },
  typography: {
    fontFamily: SANS,
    fontSize: 15,
    h1: { fontFamily: DISPLAY, fontSize: 20, letterSpacing: '0.12em', fontWeight: 500 },
    h2: { fontFamily: DISPLAY, fontSize: 18, letterSpacing: '0.08em', fontWeight: 500 },
    button: { textTransform: 'none', letterSpacing: '0.06em', fontWeight: 500 },
  },
  components: {
    MuiCssBaseline: {
      styleOverrides: {
        html: { height: '100%' },
        body: { WebkitFontSmoothing: 'antialiased' },
        'input[type="file"]': { fontSize: 13, color: '#6f6557', width: '100%' },
      },
    },
    // 一套「描边纸片」：不要 Material 的投影和渐变
    MuiPaper: {
      defaultProps: { elevation: 0 },
      styleOverrides: {
        root: { backgroundImage: 'none', border: '1px solid #e6dec9' },
      },
    },
    MuiAppBar: {
      defaultProps: { elevation: 0, color: 'inherit' },
      styleOverrides: {
        root: {
          backgroundColor: 'rgba(247, 243, 234, 0.92)',
          backdropFilter: 'blur(8px)',
          borderBottom: '1px solid #e6dec9',
        },
      },
    },
    MuiButton: { defaultProps: { disableElevation: true, size: 'large' } },
    MuiIconButton: { defaultProps: { size: 'small' } },
    MuiChip: {
      styleOverrides: { root: { fontSize: 11, letterSpacing: '0.08em' } },
    },
    MuiLinearProgress: {
      styleOverrides: { root: { height: 4, borderRadius: 2 } },
    },
    MuiListItemButton: {
      styleOverrides: { root: { borderRadius: 8, minHeight: 44 } },
    },
    MuiBottomNavigationAction: {
      styleOverrides: { root: { minWidth: 0, paddingTop: 6, paddingBottom: 6 } },
    },
  },
})
