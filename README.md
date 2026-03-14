# Studio Freya

Photography studio website — static HTML/CSS/JS, deployed via GitHub Pages.

## Structure

```
studiofreya/
├── index.html        # Main page
├── css/style.css     # All styles
├── js/main.js        # Navigation & minor interactions
├── images/           # Drop your photos here
└── .nojekyll         # Disables Jekyll processing on GitHub Pages
```

## Sections

- **Hero** — full-screen opener
- **Work** — photo gallery grid
- **Services** — Portraits, Editorial, Events, Commercial
- **About** — studio introduction
- **Contact** — form (wired to Formspree by default)

## Setup

### 1. Add your photos

Place images in the `images/` folder and replace the `.gallery-placeholder` divs in `index.html` with `<img>` tags, e.g.:

```html
<div class="gallery-item tall">
  <img src="images/portrait-01.jpg" alt="Portrait session" />
</div>
```

Add a hero background by replacing the `background:` in `.hero::before` with:

```css
background-image: url('../images/hero.jpg');
background-size: cover;
background-position: center;
opacity: 1;
```

### 2. Update content

Edit `index.html` to replace:
- `[City]` in the About section
- Social media links in the footer
- Form action URL (see Contact Form below)

### 3. Contact form

The form uses [Formspree](https://formspree.io). Create a free account, get your form ID, and replace `YOUR_FORM_ID` in the form's `action` attribute:

```html
<form action="https://formspree.io/f/YOUR_FORM_ID" method="POST">
```

## Deploy to GitHub Pages

1. Push to GitHub
2. Go to **Settings → Pages**
3. Set source to `main` branch, `/ (root)` folder
4. Your site will be live at `https://yourusername.github.io/studiofreya/`
