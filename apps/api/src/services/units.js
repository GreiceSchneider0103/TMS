// Conversão de unidades: o motor de frete trabalha sempre em kg e cm.

const WEIGHT_TO_KG = { mg: 0.000001, g: 0.001, kg: 1, t: 1000, ton: 1000, lb: 0.45359237, lbs: 0.45359237, oz: 0.028349523125 };
const LENGTH_TO_CM = { mm: 0.1, cm: 1, dm: 10, m: 100, in: 2.54, pol: 2.54, ft: 30.48 };

// Aceita número ou texto no formato brasileiro ("1.234,5") ou internacional ("1234.5").
export function parseDecimal(value) {
  if (value === undefined || value === null || value === '') return null;
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  let s = String(value).trim().replace(/\s/g, '');
  if (s.includes(',') && s.includes('.')) s = s.lastIndexOf(',') > s.lastIndexOf('.') ? s.replace(/\./g, '').replace(',', '.') : s.replace(/,/g, '');
  else if (s.includes(',')) s = s.replace(',', '.');
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

function unitKey(unit, fallback) {
  const u = String(unit || fallback).trim().toLowerCase().replace('.', '');
  return u === 'gramas' || u === 'grama' ? 'g' : u === 'quilos' || u === 'quilo' ? 'kg' : u === 'metros' || u === 'metro' ? 'm' : u === 'centimetros' ? 'cm' : u === 'milimetros' ? 'mm' : u;
}

export function toKg(value, unit = 'kg') {
  const n = parseDecimal(value);
  if (n === null) return null;
  const factor = WEIGHT_TO_KG[unitKey(unit, 'kg')];
  if (!factor) throw new Error(`Unidade de peso não suportada: ${unit}. Use g, kg, t, lb ou oz.`);
  return Number((n * factor).toFixed(6));
}

export function toCm(value, unit = 'cm') {
  const n = parseDecimal(value);
  if (n === null) return null;
  const factor = LENGTH_TO_CM[unitKey(unit, 'cm')];
  if (!factor) throw new Error(`Unidade de medida não suportada: ${unit}. Use mm, cm, m ou pol.`);
  return Number((n * factor).toFixed(4));
}

// Normaliza peso/medidas de um payload: aceita weight+weightUnit, length/width/height+dimensionUnit
// ou os campos já em kg/cm (weightKg, lengthCm...).
export function normalizeMeasures(body = {}) {
  const wUnit = body.weightUnit || 'kg';
  const dUnit = body.dimensionUnit || 'cm';
  return {
    weightKg: body.weight !== undefined ? toKg(body.weight, wUnit) : toKg(body.weightKg, 'kg'),
    lengthCm: body.length !== undefined ? toCm(body.length, dUnit) : toCm(body.lengthCm, 'cm'),
    widthCm: body.width !== undefined ? toCm(body.width, dUnit) : toCm(body.widthCm, 'cm'),
    heightCm: body.height !== undefined ? toCm(body.height, dUnit) : toCm(body.heightCm, 'cm')
  };
}
