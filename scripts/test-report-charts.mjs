/**
 * 报表趋势图渲染测试：用 echarts 的 SSR 渲染真实 SVG，
 * 验证「有数据能看到柱子/折线」「没数据也不会是空白」。
 * 用法：node scripts/test-report-charts.mjs
 */
import * as echarts from 'echarts';

let pass = 0;
let fail = 0;
const ok = (cond, msg) => {
  if (cond) { pass += 1; console.log(`   ✅ ${msg}`); }
  else { fail += 1; console.log(`   ❌ ${msg}`); }
};

const { pointsTrendOption, completionRateOption, trendLabels } = await import(
  '../client/src/utils/report-charts.ts'
);

const withData = [
  { week: '2026-08-31', points: 0, completionRate: 0 },
  { week: '2026-09-07', points: 35, completionRate: 0.25 },
  { week: '2026-09-14', points: 80, completionRate: 0.5 },
  { week: '2026-09-21', points: 20, completionRate: 0.75 },
];
const emptyData = [
  { week: '2026-08-31', points: 0, completionRate: 0 },
  { week: '2026-09-07', points: 0, completionRate: 0 },
  { week: '2026-09-14', points: 0, completionRate: 0 },
  { week: '2026-09-21', points: 0, completionRate: 0 },
];

function renderSVG(option) {
  const chart = echarts.init(null, null, {
    renderer: 'svg',
    ssr: true,
    width: 420,
    height: 260,
  });
  chart.setOption(option);
  const svg = chart.renderToSVGString();
  chart.dispose();
  return svg;
}

console.log('\n【周标签格式化】');
{
  const labels = trendLabels(withData);
  ok(labels.length === 4, `4 个周标签（实际 ${labels.length}）`);
  ok(labels[0] === '08/31' && labels[3] === '09/21', `标签格式 08/31 … 09/21（实际 ${labels.join(', ')}）`);
}

console.log('\n【积分趋势：有数据】');
{
  const svg = renderSVG(pointsTrendOption(withData));
  ok(svg.includes('<svg'), '生成了 SVG 画布');
  ok(svg.includes('<path'), `画出了图形元素（${(svg.match(/<path/g) ?? []).length} 个 path）`);
  ok(svg.includes('>35<') && svg.includes('>80<'), '柱顶数值标签渲染出 35 / 80');
  ok(svg.includes('09/14'), '横轴出现周标签 09/14');
  const opt = pointsTrendOption(withData);
  ok(
    opt.tooltip.valueFormatter(35) === '35 积分',
    `tooltip 单位显示为「${opt.tooltip.valueFormatter(35)}」（SSR 不渲染 tooltip，因此直接校验格式化函数）`,
  );
  ok(!svg.includes('NaN') && !svg.includes('undefined'), '没有 NaN / undefined 脏数据');
}

console.log('\n【完成率趋势：有数据】');
{
  const svg = renderSVG(completionRateOption(withData));
  ok(svg.includes('<path'), `画出了折线/面积（${(svg.match(/<path/g) ?? []).length} 个 path）`);
  ok(svg.includes('>25%<') && svg.includes('>75%<'), '数据点标签渲染出 25% / 75%');
  ok(svg.includes('50%'), '纵轴刻度带 %');
  ok(!svg.includes('NaN') && !svg.includes('undefined'), '没有 NaN / undefined 脏数据');
}

console.log('\n【无数据时不是空白图】');
{
  const pointsSvg = renderSVG(pointsTrendOption(emptyData));
  const rateSvg = renderSVG(completionRateOption(emptyData));
  ok(pointsSvg.includes('09/21'), '积分图仍渲染坐标轴与周标签（不是白屏）');
  ok(rateSvg.includes('09/21') && rateSvg.includes('100%'), '完成率图仍渲染坐标轴（0-100%）');
  ok(pointsSvg.includes('>0<'), '零值柱仍有 0 标签，便于看出「本周为 0」');
}

console.log(`\n通过 ${pass} 项，失败 ${fail} 项`);
process.exit(fail > 0 ? 1 : 0);
