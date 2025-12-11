from pathlib import Path
import re
p = Path('src/pages/Analyse.jsx')
text = p.read_text(encoding='utf-8')
pattern = r"// ÐYZù Palette sans bleu ni orange\r?\nconst palette = \{.*?};\r?\n"
matches = list(re.finditer(pattern, text, flags=re.S))
if len(matches) > 1:
    m = matches[1]
    text = text[:m.start()] + text[m.end():]
text = re.sub(r"if \(t\.includes\(\"cash\"\) \|\| t\.includes\(\"courant\"\) \|\| t\.includes\(\"current\"\)\) \{\s*return \"LiquiditÇ¸s\";\s*\}",
              "if (t.includes(\"cash\") || t.includes(\"courant\") || t.includes(\"current\")) {\n    return \"LiquiditÇ¸s\";\n  }\n  return \"Autres\";",
              text)
p.write_text(text, encoding='utf-8')
