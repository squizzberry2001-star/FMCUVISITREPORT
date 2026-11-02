/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./index.html",
    "./404.html",
    "./privacy.html",
    "./terms.html",
    "./js/**/*.js"
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ['"Plus Jakarta Sans"', 'Inter', 'sans-serif']
      },
      colors: {
        fm: {
          green: '#009944',
          greenDark: '#007a37',
          greenLight: '#e6f7ee',
          teal: '#0099a6',
          tealDark: '#007c87',
          tealLight: '#e6f6f8',
          blue: '#0080c6'
        }
      }
    }
  },
  plugins: []
};
