"""Mesure, page par page, la marge restante ou le débordement (px CSS).
Une valeur négative = contenu coupé par overflow:hidden."""
import pathlib, re, subprocess, sys, json
ICI = pathlib.Path(__file__).parent
CHROME = r"C:\Program Files\Google\Chrome\Application\chrome.exe"
for nom in sys.argv[1:] or ["plan-affaires.html"]:
    src = (ICI / nom).read_text(encoding="utf-8")
    js = """<script>
    window.addEventListener('load', () => {
      const out = [];
      document.querySelectorAll('.page').forEach((p, i) => {
        const r = p.getBoundingClientRect(); let bas = 0;
        p.querySelectorAll('*').forEach(e => {
          if (e.closest('.pn') || e.classList.contains('cercle') || e.classList.contains('filigrane-logo')) return;
          const b = e.getBoundingClientRect();
          if (b.height > 0 && b.bottom - r.top > bas) bas = b.bottom - r.top;
        });
        const limite = r.height - 16 * 3.78;   // marge basse 16 mm
        out.push((i) + ':' + Math.round(limite - bas));
      });
      document.body.setAttribute('data-mesure', out.join(' '));
    });
    </script></body>"""
    tmp = ICI / "_mesure.html"
    tmp.write_text(src.replace("</body>", js, 1), encoding="utf-8")
    r = subprocess.run([CHROME, "--headless=new", "--disable-gpu", "--virtual-time-budget=4000",
                        "--dump-dom", tmp.as_uri()], capture_output=True, text=True, encoding="utf-8", timeout=90)
    m = re.search(r'data-mesure="([^"]*)"', r.stdout)
    tmp.unlink(missing_ok=True)
    print(nom, "->", m.group(1) if m else "mesure introuvable")
