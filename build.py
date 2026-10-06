import pathlib, sys
d = pathlib.Path(__file__).parent
css = (d/'src/style.css').read_text(); body = (d/'src/body.html').read_text()
order = ['00-core.js', '10-ui.js', '15-sound.js', '20-post.js', '30-world.js', '35-fx.js', '40-model.js', '50-smoke.js', '55-strip.js', '56-chart.js', '60-shots-a.js', '60-shots-data.js', '60-shots-b.js', '62-blueprint.js', '65-hud.js', '66-blog.js', '67-cards.js', '70-stage.js', '90-boot.js']
js = '\n'.join((d/'src/js'/n).read_text() for n in order)
head = """<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Untitled Rocketry</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Archivo:wdth,wght@62..125,300..900&family=B612:wght@400;700&family=B612+Mono:wght@400;700&display=swap">
"""
out = head + '<style>\n' + css + '</style>\n' + """<script defer src="https://cdnjs.cloudflare.com/ajax/libs/gsap/3.12.5/gsap.min.js"></script>
<script defer src="https://cdnjs.cloudflare.com/ajax/libs/gsap/3.12.5/ScrollTrigger.min.js"></script>
<script defer src="https://unpkg.com/lenis@1.1.13/dist/lenis.min.js"></script>
""" + body + '\n<script type="module">\n' + js + '</script>\n</html>\n'
(d/(sys.argv[1] if len(sys.argv) > 1 else 'index.html')).write_text(out)
print(len(out), 'bytes')
