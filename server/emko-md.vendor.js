function c(e, t, r, n, i) {
  return { node_type: e, start_line: t, end_line: r, content: n ?? null, children: i ?? [] };
}
var p = class {
    parse(e) {
      const t = e.split(`
`);
      t.length > 1 && t[t.length - 1] === '' && t.pop();
      const r = [];
      let n = 0;
      for (; n < t.length;) {
        const i = this.parseBlock(t, n);
        i ? (r.push(i[0]), n += i[1]) : n += 1;
      }
      return c({ type: 'document' }, 0, t.length, void 0, r);
    }
    parseBlock(e, t) {
      const r = e[t];
      if (r === void 0 || r.trim() === '') return null;
      const n = this.parseHeading(e, t);
      if (n) return [n, 1];
      const i = this.parseCodeBlock(e, t);
      if (i) return i;
      const s = this.parseList(e, t);
      if (s) return s;
      const l = this.parseBlockQuote(e, t);
      return l ||
        (this.isHorizontalRule(r)
          ? [c({ type: 'horizontal_rule' }, t, t + 1), 1]
          : this.parseParagraph(e, t));
    }
    parseHeading(e, t) {
      const r = e[t];
      if (r === void 0) return null;
      const n = r.trimStart();
      let i = 0;
      for (const o of n) {
        if (o === '#') i++;
        else break;
      }
      if (i === 0 || i > 6) return null;
      const s = n.slice(i);
      if (s !== '' && !s.startsWith(' ')) return null;
      const l = s.trim();
      return c({ type: 'heading', level: i }, t, t + 1, l);
    }
    parseCodeBlock(e, t) {
      const r = e[t];
      if (r === void 0) return null;
      const n = r.trim();
      if (!n.startsWith('```')) return null;
      const i = n.replace(/^`+/, '').trim(), s = i === '' ? null : i;
      let l = t + 1;
      const o = [];
      for (; l < e.length;) {
        const a = e[l];
        if (a.trim().startsWith('```')) {
          return [
            c(
              { type: 'code_block', language: s },
              t,
              l + 1,
              o.join(`
`),
            ),
            l - t + 1,
          ];
        }
        o.push(a), l++;
      }
      return [
        c(
          { type: 'code_block', language: s },
          t,
          e.length,
          o.join(`
`),
        ),
        e.length - t,
      ];
    }
    parseList(e, t) {
      const r = e[t];
      if (r === void 0) return null;
      const n = this.isListItem(r);
      if (!n) return null;
      const [i, s] = n, l = i ? { type: 'ordered_list', start: s } : { type: 'unordered_list' };
      let o = t;
      const a = [];
      for (; o < e.length;) {
        const d = e[o];
        if (d.trim() === '') {
          const u = o + 1;
          if (u < e.length) {
            if (!this.isListItem(e[u])) break;
            o = u;
            continue;
          }
          break;
        }
        if (this.isListItem(d)) {
          const u = this.extractListItemContent(d);
          a.push(c({ type: 'list_item' }, o, o + 1, u)), o++;
        } else if (o > t && this.isIndented(d)) {
          const u = a[a.length - 1];
          u && u.content !== null && (u.content += `
` + d.trim(),
            u.end_line = o + 1), o++;
        } else break;
      }
      return a.length === 0 ? null : [c(l, t, o, void 0, a), o - t];
    }
    isListItem(e) {
      const t = e.trimStart();
      if (e.length - t.length > 3) return null;
      if (t.startsWith('- ') || t.startsWith('* ') || t.startsWith('+ ')) return [!1, 1];
      let n = '', i = 0;
      for (; i < t.length; i++) {
        const s = t[i];
        if (s >= '0' && s <= '9') n += s;
        else if (s === '.' && n !== '') {
          if (i + 1 < t.length && t[i + 1] === ' ') {
            const l = parseInt(n, 10);
            if (!isNaN(l)) return [!0, l];
          }
          break;
        } else break;
      }
      return null;
    }
    extractListItemContent(e) {
      const t = e.trimStart();
      if (t.startsWith('- ') || t.startsWith('* ') || t.startsWith('+ ')) return t.slice(2);
      for (let r = 0; r < t.length; r++) {
        if (t[r] === '.' && r + 1 < t.length && t[r + 1] === ' ') return t.slice(r + 2);
      }
      return t;
    }
    isIndented(e) {
      return e.startsWith('    ') || e.startsWith('	');
    }
    parseBlockQuote(e, t) {
      const r = e[t];
      if (r === void 0 || !r.trimStart().startsWith('> ')) return null;
      let i = t;
      const s = [];
      for (; i < e.length;) {
        const l = e[i], o = l.trimStart();
        if (o.startsWith('> ')) s.push(o.slice(2)), i++;
        else if (l.trim() === '' && i + 1 < e.length) {
          if (e[i + 1].trimStart().startsWith('> ')) s.push(''), i++;
          else break;
        } else break;
      }
      return s.length === 0 ? null : [
        c(
          { type: 'block_quote' },
          t,
          i,
          s.join(`
`),
        ),
        i - t,
      ];
    }
    isHorizontalRule(e) {
      const t = e.trim();
      if (t.length < 3) return !1;
      const r = [];
      for (const i of t) i !== ' ' && r.push(i);
      if (r.length < 3) return !1;
      const n = r[0];
      return n !== '-' && n !== '_' && n !== '*' ? !1 : r.every((i) => i === n);
    }
    parseParagraph(e, t) {
      let r = t;
      const n = [];
      for (; r < e.length;) {
        const l = e[r];
        if (l.trim() === '' || this.isBlockBoundary(l)) break;
        n.push(l), r++;
      }
      if (n.length === 0) return null;
      const i = n.join(`
`),
        s = this.extractLinks(i);
      return [c({ type: 'paragraph' }, t, r, i, s), r - t];
    }
    isBlockBoundary(e) {
      const t = e.trimStart();
      return t.startsWith('#') || t.startsWith('```') || t.startsWith('> ') || this.isListItem(e)
        ? !0
        : this.isHorizontalRule(e);
    }
    extractLinks(e) {
      const t = [];
      let r = 0;
      for (; r < e.length;) {
        if (e[r] === '[') {
          const n = this.parseLink(e, r);
          if (n) {
            const [i, s, l] = n;
            t.push(c({ type: 'link', url: i, title: s }, 0, 0)), r = l;
            continue;
          }
        }
        r++;
      }
      return t;
    }
    parseLink(e, t) {
      let r = t + 1;
      for (; r < e.length && e[r] !== ']';) r++;
      if (r >= e.length || e[r] !== ']' || (r++, r >= e.length || e[r] !== '(')) return null;
      r++;
      let n = '';
      for (; r < e.length && e[r] !== ')' && e[r] !== ' ';) n += e[r], r++;
      let i = null;
      if (r < e.length && e[r] === ' ' && (r++, r < e.length && e[r] === '"')) {
        r++;
        let s = '';
        for (; r < e.length && e[r] !== '"';) s += e[r], r++;
        r < e.length && e[r] === '"' && (i = s, r++);
      }
      return r < e.length && e[r] === ')' ? [n, i, r + 1] : null;
    }
  },
  f = class {
    headingIds = new Map();
    annotating = !1;
    nodeCounter = 0;
    nodeList = [];
    get nodes() {
      return this.nodeList;
    }
    render(e, t) {
      return this.headingIds.clear(),
        this.annotating = t?.annotate ?? !1,
        this.nodeCounter = 0,
        this.nodeList = [],
        this.renderNode(e);
    }
    tag(e, t) {
      if (!this.annotating) return t;
      const r = this.nodeCounter++;
      return this.nodeList.push(e), t.replace(/>/, ` data-node="${r}">`);
    }
    renderNode(e) {
      const t = e.node_type;
      switch (t.type) {
        case 'document':
          return e.children.map((r) => this.renderNode(r)).join(`
`);
        case 'heading':
          return this.tag(e, this.renderHeading(e, t.level));
        case 'paragraph':
          return this.tag(e, `<p>${this.renderInline(e.content ?? '')}</p>`);
        case 'code_block':
          return this.tag(e, this.renderCodeBlock(e.content ?? '', t.language));
        case 'unordered_list':
          return this.tag(e, `<ul>${e.children.map((r) => this.renderNode(r)).join('')}</ul>`);
        case 'ordered_list': {
          const r = t.start !== 1 ? ` start="${t.start}"` : '';
          return this.tag(e, `<ol${r}>${e.children.map((n) => this.renderNode(n)).join('')}</ol>`);
        }
        case 'list_item':
          return this.renderListItem(e);
        case 'block_quote': {
          const r = e.children.length > 0
            ? e.children.map((n) => this.renderNode(n)).join('')
            : `<p>${this.renderInline(e.content ?? '')}</p>`;
          return this.tag(e, `<blockquote>${r}</blockquote>`);
        }
        case 'horizontal_rule':
          return this.tag(e, '<hr>');
        case 'link': {
          const r = h(t.url), n = t.title ? ` title="${h(t.title)}"` : '';
          return `<a href="${r}"${n}>${this.renderInline(e.content ?? t.url)}</a>`;
        }
        default:
          return '';
      }
    }
    renderHeading(e, t) {
      const r = e.content ?? '', n = this.generateHeadingId(r);
      return `<h${t} id="${h(n)}">${this.renderInline(r)}</h${t}>`;
    }
    renderCodeBlock(e, t) {
      return t === 'router-slot'
        ? this.renderCustomElement('router-slot', e)
        : t?.startsWith('widget:')
        ? this.renderCustomElement(`widget-${t.slice(7)}`, e)
        : `<pre><code${t ? ` class="language-${h(t)}"` : ''}>${h(e)}</code></pre>`;
    }
    renderCustomElement(e, t) {
      if (!t.trim()) return `<${e}></${e}>`;
      let r;
      try {
        r = JSON.parse(t);
      } catch {
        return `<${e}></${e}>`;
      }
      const n = Object.entries(r).map(([i, s]) => {
        const l = i.replace(/([A-Z])/g, '-$1').toLowerCase(),
          o = typeof s == 'string' ? s : JSON.stringify(s);
        return `${l}="${h(o)}"`;
      }).join(' ');
      return n ? `<${e} ${n}></${e}>` : `<${e}></${e}>`;
    }
    renderListItem(e) {
      return e.children.length > 0
        ? `<li>${e.children.map((t) => this.renderNode(t)).join('')}</li>`
        : `<li>${this.renderInline(e.content ?? '')}</li>`;
    }
    generateHeadingId(e) {
      const t = e.toLowerCase().replace(/[^\w\s-]/g, '').replace(/\s+/g, '-').replace(/-+/g, '-')
          .replace(/^-|-$/g, ''),
        r = this.headingIds.get(t) ?? 0;
      return this.headingIds.set(t, r + 1), r > 0 ? `${t}-${r}` : t;
    }
    renderInline(e) {
      let t = h(e);
      return t = t.replace(/!\[([^\]]*)\]\(([^)]+)\)/g, (r, n, i) => {
        const s = i.match(/^(.+?)\s+&quot;(.+)&quot;$/);
        return s ? `<img src="${s[1]}" alt="${n}" title="${s[2]}">` : `<img src="${i}" alt="${n}">`;
      }),
        t = t.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (r, n, i) => {
          const s = i.match(/^(.+?)\s+&quot;(.+)&quot;$/);
          return s ? `<a href="${s[1]}" title="${s[2]}">${n}</a>` : `<a href="${i}">${n}</a>`;
        }),
        t = t.replace(/`([^`]+)`/g, (r, n) => `<code>${n}</code>`),
        t = t.replace(/\*\*([^*]+)\*\*/g, (r, n) => `<strong>${n}</strong>`),
        t = t.replace(/__([^_]+)__/g, (r, n) => `<strong>${n}</strong>`),
        t = t.replace(/\*([^*]+)\*/g, (r, n) => `<em>${n}</em>`),
        t = t.replace(/_([^_]+)_/g, (r, n) => `<em>${n}</em>`),
        t;
    }
  };
function h(e) {
  return e.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(
    /"/g,
    '&quot;',
  );
}
function g() {
  const e = new p(), t = new f();
  return (r) => {
    const n = e.parse(r);
    return t.render(n);
  };
}
export { g as createMarkdownRender };
