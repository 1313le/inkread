/* paper-spec.js · 出纸规格的唯一一份算法（v2.21 E9）
   —— 两个消费者用的是同一个文件：print.html 以 <script> 载入，
      /api/export/<id>.html 用 new Function 跑它（与 md.js 同一套共享办法）。
      纸面视图上选了 A5 横版，「存成文件」的那份 HTML 也必须出 A5 横版；
      两边各抄一张尺寸表，迟早会分叉成同一本书两个版式。
   —— 尺寸只写页框高宽与图高上限，页边（20mm 18mm）留在这里是因为两个消费者都用它排版。 */
(function () {
  var SIZES = {
    A4: { size: "A4", imgh: 180, h: 297, w: 210 },
    A5: { size: "A5", imgh: 130, h: 210, w: 148 },
    B5: { size: "B5", imgh: 150, h: 250, w: 176 },
    LETTER: { size: "Letter", imgh: 170, h: 279, w: 216 },
    LEGAL: { size: "Legal", imgh: 220, h: 356, w: 216 }
  };

  /* 认不出的纸型返回 null，由调用方决定退到哪一档 —— 静默换成 A4 是两个消费者共同的默认，
     但「用户点了 Legal 却打出 A4」必须能被页面自己发现（选择器要回显真实生效的那一档）。 */
  function pick(p) { return SIZES[String(p || "").toUpperCase()] || null; }

  function spec(o) {
    var P = pick(o && o.paper) || SIZES.A4;
    var land = !!(o && o.land);
    /* 图的最大占高 = 页框高 − 上下页边(20mm×2) 再留一行标题，按纸型给死值：
       打印里 vh 是否等同页框高度各版本不一致，不赌。 */
    var imgh = Math.min(P.imgh, (land ? P.w : P.h) - 40 - 10);
    /* 屏幕上真正排得下的宽度 = 页宽 − 左右页边(18mm×2) − body 自身 padding(6mm×2)。
       预览收窄到这一个数，换行才和出纸一致；只管屏幕，纸上由 @page 说话。 */
    var view = Math.round((land ? P.h : P.w) - 48);
    return {
      paper: P.size, land: land, imgh: imgh, view: view,
      css: "@page { size: " + P.size + (land ? " landscape" : " portrait") + "; margin: 20mm 18mm; }\n" +
        ":root { --p-imgh: " + imgh + "mm; }\n" +
        "@media screen { body { max-width: " + view + "mm; } }"
    };
  }

  window.PaperSpec = {
    spec: spec, pick: pick,
    sizes: Object.keys(SIZES).map(function (k) { return SIZES[k].size; })
  };
})();
