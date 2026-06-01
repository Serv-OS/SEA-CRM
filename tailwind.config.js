/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        ink:        '#1a1a1a',
        'ink-soft': 'rgba(0,0,0,0.03)',
        'ink-line': 'rgba(0,0,0,0.06)',
        paper:      '#1a1a1a',
        'paper-soft':'#333333',
        ember:      '#E8743C',
        'ember-deep':'#c45a20',
        muted:      '#777777',
        dim:        '#999999',
        panel:      'rgba(255,255,255,0.18)',
        card:       'rgba(255,255,255,0.30)',
        bdr:        'rgba(255,255,255,0.35)',
      },
      fontFamily: {
        sans:    ['-apple-system', 'BlinkMacSystemFont', 'SF Pro Display', 'Geist', 'system-ui', 'sans-serif'],
        display: ['SF Pro Display', 'Geist', '-apple-system', 'system-ui', 'sans-serif'],
        mono:    ['SF Mono', 'Geist Mono', 'ui-monospace', 'SFMono-Regular', 'monospace'],
      },
      borderRadius: {
        '2xl': '16px',
        '3xl': '24px',
      },
    },
  },
  plugins: [],
};
