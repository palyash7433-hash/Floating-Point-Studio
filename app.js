/* ==========================================================================
   DATA REPRESENTATION VISUALIZER — Application Engine
   ==========================================================================
   Modules:
     1. State & Configuration
     2. Bit Conversion Utilities  (float32/64, integer ↔ bits)
     3. Range Calculations
     4. Overflow Detection
     5. Input → Bits Pipeline
     6. Bits → Display Values
     7. Bit Grid Rendering
     8. Bit Flipping (interactive sandbox)
     9. Display Updates
    10. Precision Loss Detection
    11. Educational Walkthrough Generator
    12. Clipboard Utilities
    13. Toast Notifications
    14. Smart Logic Guards
    15. Sign Toggle & Data Type Logic
    16. Main Update Pipeline
    17. Event Binding & Initialisation
   ========================================================================== */


/* ==========================================================================
   1. STATE & CONFIGURATION
   ========================================================================== */

const state = {
    bits: [],
    dataType: 'int',        // byte | short | int | long | float | double
    isSigned: true,
    inputRaw: '0',
    suppressInputSync: false, // prevents feedback loop during bit-flip updates
};

const TYPE_CONFIG = {
    byte:   { bits: 8,  isFloat: false },
    short:  { bits: 16, isFloat: false },
    int:    { bits: 32, isFloat: false },
    long:   { bits: 64, isFloat: false },
    float:  { bits: 32, isFloat: true, expBits: 8,  manBits: 23, bias: 127 },
    double: { bits: 64, isFloat: true, expBits: 11, manBits: 52, bias: 1023 },
};


/* ── DOM References ──────────────────────────────────────────────────────── */

const $input       = document.getElementById('valueInput');
const $dataType    = document.getElementById('dataTypeSelect');
const $btnSigned   = document.getElementById('btnSigned');
const $btnUnsigned = document.getElementById('btnUnsigned');
const $signNote    = document.getElementById('signNote');
const $rangeMin    = document.getElementById('rangeMin');
const $rangeMax    = document.getElementById('rangeMax');
const $overflow    = document.getElementById('overflowWarning');
const $overflowTxt = document.getElementById('overflowText');
const $bitGrid     = document.getElementById('bitGridContainer');
const $legend      = document.getElementById('bitLegend');
const $binaryVal   = document.getElementById('binaryValue');
const $hexVal      = document.getElementById('hexValue');
const $octalVal    = document.getElementById('octalValue');
const $decimalVal  = document.getElementById('decimalValue');
const $walkthrough = document.getElementById('walkthroughAccordion');
const $precCard    = document.getElementById('precisionCard');
const $precText    = document.getElementById('precisionText');


/* ==========================================================================
   2. BIT CONVERSION UTILITIES
   ========================================================================== */

/** Convert a float (Number) → 32-element bit array (MSB first). */
function float32ToBits(value) {
    const buf = new ArrayBuffer(4);
    new DataView(buf).setFloat32(0, value, false);
    const bits = [];
    for (let i = 0; i < 4; i++) {
        const b = new DataView(buf).getUint8(i);
        for (let j = 7; j >= 0; j--) bits.push((b >> j) & 1);
    }
    return bits;
}

/** Convert a 32-element bit array → float. */
function bitsToFloat32(bits) {
    const buf = new ArrayBuffer(4);
    const dv = new DataView(buf);
    for (let i = 0; i < 4; i++) {
        let byte = 0;
        for (let j = 0; j < 8; j++) byte = (byte << 1) | bits[i * 8 + j];
        dv.setUint8(i, byte);
    }
    return dv.getFloat32(0, false);
}

/** Convert a double (Number) → 64-element bit array (MSB first). */
function float64ToBits(value) {
    const buf = new ArrayBuffer(8);
    new DataView(buf).setFloat64(0, value, false);
    const bits = [];
    for (let i = 0; i < 8; i++) {
        const b = new DataView(buf).getUint8(i);
        for (let j = 7; j >= 0; j--) bits.push((b >> j) & 1);
    }
    return bits;
}

/** Convert a 64-element bit array → double. */
function bitsToFloat64(bits) {
    const buf = new ArrayBuffer(8);
    const dv = new DataView(buf);
    for (let i = 0; i < 8; i++) {
        let byte = 0;
        for (let j = 0; j < 8; j++) byte = (byte << 1) | bits[i * 8 + j];
        dv.setUint8(i, byte);
    }
    return dv.getFloat64(0, false);
}

/** Convert a BigInt value → bit array. Handles Two's Complement for negatives. */
function integerToBits(value, bitCount, isSigned) {
    let v = BigInt(value);
    const max = 1n << BigInt(bitCount);

    if (isSigned && v < 0n) {
        v = max + v; // Two's complement
    }
    v = ((v % max) + max) % max; // mask to bitCount

    const bits = new Array(bitCount).fill(0);
    for (let i = bitCount - 1; i >= 0; i--) {
        bits[i] = Number(v & 1n);
        v >>= 1n;
    }
    return bits;
}

/** Convert a bit array → BigInt integer. */
function bitsToInteger(bits, isSigned) {
    const n = bits.length;
    let v = 0n;
    for (let i = 0; i < n; i++) v = (v << 1n) | BigInt(bits[i]);

    if (isSigned && bits[0] === 1) {
        v -= (1n << BigInt(n));
    }
    return v;
}


/* ==========================================================================
   3. RANGE CALCULATIONS
   ========================================================================== */

function getRange(dataType, isSigned) {
    const cfg = TYPE_CONFIG[dataType];
    if (cfg.isFloat) {
        if (dataType === 'float') {
            return { min: -3.4028235e+38, max: 3.4028235e+38, label: '±3.4028235 × 10³⁸' };
        } else {
            return { min: -1.7976931348623157e+308, max: 1.7976931348623157e+308, label: '±1.7977 × 10³⁰⁸' };
        }
    }
    const n = BigInt(cfg.bits);
    if (isSigned) {
        return { min: -(1n << (n - 1n)), max: (1n << (n - 1n)) - 1n };
    }
    return { min: 0n, max: (1n << n) - 1n };
}

function formatBigInt(v) {
    return v.toLocaleString ? v.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',') : v.toString();
}

function updateRangeDisplay() {
    const r = getRange(state.dataType, state.isSigned);
    const cfg = TYPE_CONFIG[state.dataType];
    if (cfg.isFloat) {
        $rangeMin.textContent = `−${state.dataType === 'float' ? '3.4028235e+38' : '1.7977e+308'}`;
        $rangeMax.textContent = `+${state.dataType === 'float' ? '3.4028235e+38' : '1.7977e+308'}`;
    } else {
        $rangeMin.textContent = formatBigInt(r.min);
        $rangeMax.textContent = formatBigInt(r.max);
    }
}


/* ==========================================================================
   4. OVERFLOW DETECTION
   ========================================================================== */

function checkOverflow(rawInput) {
    const cfg = TYPE_CONFIG[state.dataType];

    if (cfg.isFloat) {
        const v = parseFloat(rawInput);
        if (isNaN(v) || !isFinite(v)) return false;
        if (state.dataType === 'float') {
            if (Math.abs(v) > 3.4028235e+38) return true;
        }
        return false;
    }

    try {
        const v = BigInt(rawInput);
        const r = getRange(state.dataType, state.isSigned);
        return v < r.min || v > r.max;
    } catch {
        return false;
    }
}


/* ==========================================================================
   5. INPUT → BITS
   ========================================================================== */

function inputToBits(rawInput) {
    const cfg = TYPE_CONFIG[state.dataType];
    const bitCount = cfg.bits;

    if (cfg.isFloat) {
        const v = parseSpecialFloat(rawInput);
        return state.dataType === 'float' ? float32ToBits(v) : float64ToBits(v);
    }

    try {
        const v = BigInt(rawInput);
        return integerToBits(v, bitCount, state.isSigned);
    } catch {
        return new Array(bitCount).fill(0);
    }
}

function parseSpecialFloat(raw) {
    const s = raw.trim().toLowerCase();
    if (s === 'nan') return NaN;
    if (s === 'infinity' || s === '+infinity' || s === 'inf' || s === '+inf') return Infinity;
    if (s === '-infinity' || s === '-inf') return -Infinity;
    const v = Number(raw);
    return isNaN(v) ? 0 : v;
}


/* ==========================================================================
   6. BITS → DISPLAY VALUES
   ========================================================================== */

function bitsToDecimalString(bits) {
    const cfg = TYPE_CONFIG[state.dataType];
    if (cfg.isFloat) {
        const v = (state.dataType === 'float') ? bitsToFloat32(bits) : bitsToFloat64(bits);
        if (Object.is(v, -0)) return '-0';
        if (isNaN(v)) return 'NaN';
        if (v === Infinity) return 'Infinity';
        if (v === -Infinity) return '-Infinity';
        return toPrecisionString(v, state.dataType === 'float' ? 9 : 17);
    }
    return bitsToInteger(bits, state.isSigned).toString();
}

function toPrecisionString(v, digits) {
    const s = v.toPrecision(digits);
    if (s.includes('.')) {
        let trimmed = s.replace(/0+$/, '');
        if (trimmed.endsWith('.')) trimmed += '0';
        return trimmed;
    }
    return s;
}

function bitsToUnsignedBigInt(bits) {
    let v = 0n;
    for (const b of bits) v = (v << 1n) | BigInt(b);
    return v;
}

function getHexString(bits) {
    const v = bitsToUnsignedBigInt(bits);
    const hexDigits = TYPE_CONFIG[state.dataType].bits / 4;
    return '0x' + v.toString(16).toUpperCase().padStart(hexDigits, '0');
}

function getOctalString(bits) {
    return '0o' + bitsToUnsignedBigInt(bits).toString(8);
}

function getBinaryString(bits) {
    let s = '';
    for (let i = 0; i < bits.length; i++) {
        if (i > 0 && i % 8 === 0) s += ' ';
        s += bits[i];
    }
    return s;
}

function getRawBinaryString(bits) {
    return bits.join('');
}


/* ==========================================================================
   7. BIT GRID RENDERING
   ========================================================================== */

function getBitFieldType(index) {
    const cfg = TYPE_CONFIG[state.dataType];
    if (cfg.isFloat) {
        if (index === 0) return 'sign';
        if (index <= cfg.expBits) return 'exponent';
        return 'mantissa';
    }
    if (state.isSigned && index === 0) return 'sign';
    return 'data';
}

function renderLegend() {
    const cfg = TYPE_CONFIG[state.dataType];
    let html = '';
    if (cfg.isFloat) {
        html += '<div class="legend-item"><div class="legend-swatch sign"></div>Sign</div>';
        html += '<div class="legend-item"><div class="legend-swatch exponent"></div>Exponent</div>';
        html += '<div class="legend-item"><div class="legend-swatch mantissa"></div>Mantissa</div>';
    } else {
        if (state.isSigned) {
            html += '<div class="legend-item"><div class="legend-swatch sign"></div>Sign</div>';
        }
        html += '<div class="legend-item"><div class="legend-swatch data"></div>Data</div>';
    }
    $legend.innerHTML = html;
}

function renderBitGrid() {
    const bits = state.bits;
    const n = bits.length;
    let html = '';

    for (let byteIdx = 0; byteIdx < n / 8; byteIdx++) {
        const startBit = byteIdx * 8;
        const endBit = startBit + 7;
        html += `<div class="byte-group" data-label="Byte ${byteIdx}">`;
        for (let i = startBit; i <= endBit; i++) {
            const val = bits[i];
            const fieldType = getBitFieldType(i);
            const onClass = val === 1 ? 'on' : '';
            const bitPosition = n - 1 - i;
            html += `<div class="bit-box ${onClass} type-${fieldType}" data-index="${i}" onclick="flipBit(${i})" title="Bit ${bitPosition} (${fieldType})">
                        <span class="bit-digit">${val}</span>
                        <span class="bit-index">${bitPosition}</span>
                     </div>`;
        }
        html += '</div>';
    }
    $bitGrid.innerHTML = html;
}


/* ==========================================================================
   8. BIT FLIPPING
   ========================================================================== */

function flipBit(index) {
    state.bits[index] = state.bits[index] === 0 ? 1 : 0;

    // Animate the flipped bit
    const box = $bitGrid.querySelector(`[data-index="${index}"]`);
    if (box) {
        box.classList.add('flipping');
        setTimeout(() => box.classList.remove('flipping'), 200);
    }

    // Sync the input field with the new value
    state.suppressInputSync = true;
    const decStr = bitsToDecimalString(state.bits);
    state.inputRaw = decStr;
    $input.value = decStr;
    state.suppressInputSync = false;

    updateDisplays();
}


/* ==========================================================================
   9. DISPLAY UPDATES
   ========================================================================== */

function updateDisplays() {
    renderBitGrid();
    $binaryVal.textContent = getBinaryString(state.bits);
    $hexVal.textContent    = getHexString(state.bits);
    $octalVal.textContent  = getOctalString(state.bits);
    $decimalVal.textContent = bitsToDecimalString(state.bits);

    // Overflow warning
    if (checkOverflow(state.inputRaw)) {
        $overflow.style.display = 'flex';
        $overflowTxt.textContent = `Value overflows the ${state.dataType.toUpperCase()} range and will wrap around.`;
    } else {
        $overflow.style.display = 'none';
    }

    checkPrecisionLoss();
    generateWalkthrough();
}


/* ==========================================================================
   10. PRECISION LOSS DETECTION
   ========================================================================== */

function checkPrecisionLoss() {
    const cfg = TYPE_CONFIG[state.dataType];
    if (!cfg.isFloat) { $precCard.style.display = 'none'; return; }

    const inputVal = parseSpecialFloat(state.inputRaw);
    if (isNaN(inputVal) || !isFinite(inputVal)) { $precCard.style.display = 'none'; return; }

    const storedVal = state.dataType === 'float'
        ? bitsToFloat32(state.bits)
        : bitsToFloat64(state.bits);

    if (isNaN(storedVal) || !isFinite(storedVal)) { $precCard.style.display = 'none'; return; }

    const hasLoss = inputVal !== storedVal;
    const fractPart = Math.abs(inputVal) % 1;
    const isRepeatingFraction = fractPart !== 0 && !canRepresentExactly(fractPart);

    if (hasLoss || isRepeatingFraction) {
        $precCard.style.display = 'block';
        let msg = '';
        if (hasLoss) {
            msg  = `The input value <span class="stored-value">${inputVal}</span> cannot be exactly represented in IEEE 754 ${state.dataType === 'float' ? 'single' : 'double'}-precision format. `;
            msg += `The closest representable value is <span class="stored-value">${toPrecisionString(storedVal, state.dataType === 'float' ? 9 : 17)}</span>. `;
        }
        if (isRepeatingFraction) {
            msg += `The fractional part <span class="stored-value">${fractPart}</span> produces an infinitely repeating binary pattern, similar to how 1/3 = 0.333… in decimal.`;
        }
        $precText.innerHTML = msg;
    } else {
        $precCard.style.display = 'none';
    }
}

/** A fraction terminates in binary iff repeated doubling reaches zero within 52 steps. */
function canRepresentExactly(frac) {
    let f = Math.abs(frac);
    for (let i = 0; i < 53; i++) {
        f *= 2;
        if (f >= 1) f -= 1;
        if (f === 0) return true;
    }
    return false;
}


/* ==========================================================================
   11. EDUCATIONAL WALKTHROUGH GENERATOR
   ========================================================================== */

function generateWalkthrough() {
    const cfg = TYPE_CONFIG[state.dataType];
    const sections = cfg.isFloat ? generateFloatWalkthrough() : generateIntegerWalkthrough();

    let html = '';
    sections.forEach((sec, i) => {
        html += `<div class="accordion-item${i === 0 ? ' open' : ''}" onclick="toggleAccordion(event, this)">
            <div class="accordion-header">
                <span class="accordion-arrow">▶</span>
                <span class="accordion-title">${sec.title}</span>
                ${sec.badge ? `<span class="accordion-badge">${sec.badge}</span>` : ''}
            </div>
            <div class="accordion-body">
                <div class="accordion-content">${sec.content}</div>
            </div>
        </div>`;
    });
    $walkthrough.innerHTML = html;
}

function toggleAccordion(e, item) {
    if (!e.target.closest('.accordion-header')) return;
    item.classList.toggle('open');
}


/* ---------- Integer Walkthrough ------------------------------------------ */

function generateIntegerWalkthrough() {
    const sections = [];
    const decStr = bitsToDecimalString(state.bits);
    const cfg = TYPE_CONFIG[state.dataType];
    const bitCount = cfg.bits;

    let inputVal;
    try { inputVal = BigInt(state.inputRaw); } catch { inputVal = 0n; }

    const isNeg = state.isSigned && inputVal < 0n;
    const absVal = isNeg ? -inputVal : inputVal;

    /* — Section 1: Division-by-2 — */
    if (absVal === 0n) {
        sections.push({
            title: 'Binary Conversion',
            badge: 'Division Method',
            content: `<p>The value is <span class="bit-string">0</span>, which is simply all zeros in any bit width.</p>
                      <div class="result-box">${'0'.repeat(bitCount)}</div>`
        });
    } else {
        let html = `<p class="step-title">Converting ${absVal.toString()} to binary using successive division by 2:</p>`;
        html += '<table class="math-table"><tr><th>Step</th><th>Division</th><th>Quotient</th><th>Remainder</th></tr>';

        let q = absVal;
        const remainders = [];
        let step = 1;
        while (q > 0n) {
            const r = q % 2n;
            const newQ = q / 2n;
            html += `<tr><td>${step}</td><td>${q} ÷ 2</td><td>${newQ}</td><td class="remainder">${r}</td></tr>`;
            remainders.push(Number(r));
            q = newQ;
            step++;
            if (step > 200) { html += '<tr><td colspan="4">… (truncated for display)</td></tr>'; break; }
        }
        html += '</table>';

        remainders.reverse();
        const rawBin = remainders.join('');
        html += `<p>Reading remainders from bottom to top: <span class="bit-string">${rawBin}</span></p>`;
        html += `<p>Padded to ${bitCount} bits: <span class="bit-string">${rawBin.padStart(bitCount, '0')}</span></p>`;

        sections.push({ title: 'Binary Conversion (Absolute Value)', badge: 'Division Method', content: html });
    }

    /* — Section 2: Two's Complement (negative only) — */
    if (isNeg) {
        const absBits     = integerToBits(absVal, bitCount, false);
        const invertedBits = absBits.map(b => b === 0 ? 1 : 0);
        const tcBits      = [...invertedBits];
        let carry = 1;
        for (let i = tcBits.length - 1; i >= 0 && carry; i--) {
            const sum = tcBits[i] + carry;
            tcBits[i] = sum % 2;
            carry = Math.floor(sum / 2);
        }

        let html = `<p class="step-title">Converting -${absVal} using Two's Complement:</p>`;
        html += `<p><strong>Step 1:</strong> Start with the binary of |${absVal}| = ${absVal}:</p>`;
        html += `<div class="result-box">${absBits.join('')}</div>`;
        html += `<p><strong>Step 2:</strong> Invert all bits (One's Complement):</p>`;
        html += `<div class="result-box">${invertedBits.join('')}</div>`;
        html += `<p><strong>Step 3:</strong> Add 1 to get Two's Complement:</p>`;
        html += `<div class="result-box">${tcBits.join('')}</div>`;

        html += '<p class="step-title">Verification:</p>';
        const terms = [];
        for (let i = 0; i < tcBits.length; i++) {
            if (tcBits[i] === 1) {
                const pos = tcBits.length - 1 - i;
                terms.push(i === 0 && state.isSigned ? `−2<sup>${pos}</sup>` : `2<sup>${pos}</sup>`);
            }
        }
        if (terms.length > 0) {
            html += `<p>${terms.join(' + ')} = <span class="bit-string">${decStr}</span></p>`;
        }

        sections.push({ title: "Two's Complement", badge: 'Signed Negative', content: html });
    }

    /* — Section 3: Positional value breakdown — */
    {
        let html = '<p class="step-title">Positional Bit Values:</p>';
        const bits = state.bits;
        const entries = [];
        for (let i = 0; i < bits.length; i++) {
            if (bits[i] === 1) {
                const pos = bits.length - 1 - i;
                const isSignBit = state.isSigned && i === 0;
                const weight = isSignBit
                    ? `−2^${pos} = −${(1n << BigInt(pos)).toString()}`
                    : `2^${pos} = ${(1n << BigInt(pos)).toString()}`;
                entries.push({ pos, weight, isSign: isSignBit });
            }
        }
        if (entries.length === 0) {
            html += '<p>All bits are 0 — the value is <span class="bit-string">0</span>.</p>';
        } else {
            html += '<table class="math-table"><tr><th>Bit Position</th><th>Weight</th></tr>';
            entries.forEach(e => {
                html += `<tr><td>${e.pos}${e.isSign ? ' (sign)' : ''}</td><td>${e.weight}</td></tr>`;
            });
            html += '</table>';
            html += `<p>Sum = <span class="bit-string">${decStr}</span></p>`;
        }
        sections.push({ title: 'Positional Value Breakdown', badge: `${bitCount}-bit`, content: html });
    }

    return sections;
}


/* ---------- Float / Double Walkthrough ----------------------------------- */

function generateFloatWalkthrough() {
    const sections = [];
    const cfg      = TYPE_CONFIG[state.dataType];
    const bits     = state.bits;
    const isDouble = state.dataType === 'double';
    const typeName = isDouble ? 'Double (64-bit)' : 'Float (32-bit)';
    const precision = isDouble ? 'double' : 'single';
    const value    = isDouble ? bitsToFloat64(bits) : bitsToFloat32(bits);

    // Extract fields
    const signBit  = bits[0];
    const expBits  = bits.slice(1, 1 + cfg.expBits);
    const manBits  = bits.slice(1 + cfg.expBits);
    const expVal   = parseInt(expBits.join(''), 2);
    const expUnbiased = expVal - cfg.bias;

    /* — Section 1: Field Breakdown — */
    {
        let html = `<p class="step-title">IEEE 754 ${precision}-precision layout:</p>`;
        html += `<table class="math-table">
            <tr><th>Field</th><th>Bits</th><th>Value</th></tr>
            <tr><td>Sign</td><td><span class="bit-string sign-bits">${signBit}</span></td><td>${signBit === 0 ? 'Positive (+)' : 'Negative (−)'}</td></tr>
            <tr><td>Exponent</td><td><span class="bit-string exp-bits">${expBits.join('')}</span></td><td>Biased: ${expVal}, Unbiased: ${expVal} − ${cfg.bias} = ${expUnbiased}</td></tr>
            <tr><td>Mantissa</td><td><span class="bit-string mant-bits">${manBits.join('')}</span></td><td>Fraction bits (${manBits.length} bits)</td></tr>
        </table>`;
        html += `<div class="result-box"><span class="bit-string sign-bits">${signBit}</span> <span class="bit-string exp-bits">${expBits.join('')}</span> <span class="bit-string mant-bits">${manBits.join('')}</span></div>`;

        sections.push({ title: 'IEEE 754 Field Breakdown', badge: typeName, content: html });
    }

    // Handle special values
    const allExpOnes  = expBits.every(b => b === 1);
    const allManZeros = manBits.every(b => b === 0);
    const allExpZeros = expBits.every(b => b === 0);

    if (allExpOnes && !allManZeros) {
        sections.push({
            title: 'Special Value: NaN', badge: 'Not a Number',
            content: `<p>When all exponent bits are <span class="bit-string exp-bits">1</span> and the mantissa is <strong>non-zero</strong>, the value represents <strong>NaN</strong> (Not a Number).</p>
                <p>NaN is used for undefined mathematical results like 0/0, √(−1), etc.</p>
                <p class="note">NaN ≠ NaN — IEEE 754 specifies that NaN is not equal to anything, including itself.</p>`
        });
        return sections;
    }
    if (allExpOnes && allManZeros) {
        sections.push({
            title: `Special Value: ${signBit === 0 ? '+' : '−'}Infinity`, badge: 'Infinity',
            content: `<p>When all exponent bits are <span class="bit-string exp-bits">1</span> and the mantissa is all <span class="bit-string mant-bits">0</span>, the value represents <strong>${signBit === 0 ? 'Positive' : 'Negative'} Infinity</strong>.</p>
                <p>This results from overflow or division by zero with the appropriate sign.</p>`
        });
        return sections;
    }
    if (allExpZeros && allManZeros) {
        sections.push({
            title: `Special Value: ${signBit === 1 ? 'Negative ' : ''}Zero`,
            badge: signBit === 1 ? '−0' : '+0',
            content: `<p>When both the exponent and mantissa are all zeros, the value is <strong>${signBit === 1 ? 'negative ' : ''}zero</strong>.</p>
                ${signBit === 1 ? '<p>IEEE 754 distinguishes between +0 and −0. While they compare as equal (0 === −0), they can produce different results in certain operations (e.g., 1/+0 = +∞ but 1/−0 = −∞).</p>' : ''}`
        });
        return sections;
    }
    if (allExpZeros && !allManZeros) {
        sections.push({
            title: 'Subnormal (Denormalized) Number', badge: 'Subnormal',
            content: `<p>When the exponent is all zeros but the mantissa is non-zero, this is a <strong>subnormal number</strong>.</p>
                <p>Subnormals use an implicit leading <strong>0.</strong> (not 1.) and a fixed exponent of <strong>${1 - cfg.bias}</strong>.</p>
                <p>Value = (−1)<sup>${signBit}</sup> × 0.${manBits.join('')}<sub>2</sub> × 2<sup>${1 - cfg.bias}</sup></p>
                <p>This allows representation of very small numbers close to zero, enabling "gradual underflow."</p>
                <p>Decimal value: <span class="bit-string">${toPrecisionString(value, isDouble ? 17 : 9)}</span></p>`
        });
        return sections;
    }

    // Normal number — conversion steps
    const inputVal = parseSpecialFloat(state.inputRaw);
    if (!isNaN(inputVal) && isFinite(inputVal) && inputVal !== 0) {
        sections.push(...generateFloatConversionSteps(inputVal, isDouble));
    }

    /* — Mathematical Reconstruction — */
    {
        let mantissaVal = 1;
        for (let i = 0; i < manBits.length; i++) {
            if (manBits[i] === 1) mantissaVal += Math.pow(2, -(i + 1));
        }
        const reconstructed = Math.pow(-1, signBit) * mantissaVal * Math.pow(2, expUnbiased);

        let html = '<p class="step-title">Mathematical Reconstruction:</p>';
        html += '<p>Value = (−1)<sup>sign</sup> × (1 + mantissa fraction) × 2<sup>(exponent − bias)</sup></p>';
        html += `<p>Value = (−1)<sup>${signBit}</sup> × ${toPrecisionString(mantissaVal, 10)} × 2<sup>${expUnbiased}</sup></p>`;
        html += `<p>Value = ${signBit === 1 ? '−' : ''}${toPrecisionString(mantissaVal, 10)} × ${toPrecisionString(Math.pow(2, expUnbiased), 10)}</p>`;
        html += `<p>Value = <span class="bit-string">${toPrecisionString(reconstructed, isDouble ? 17 : 9)}</span></p>`;

        sections.push({ title: 'Mathematical Reconstruction', badge: 'Formula', content: html });
    }

    return sections;
}


/* ---------- Float Step-by-Step Conversion -------------------------------- */

function generateFloatConversionSteps(inputVal, isDouble) {
    const sections = [];
    const bias = isDouble ? 1023 : 127;
    const mantissaBits = isDouble ? 52 : 23;
    const sign = inputVal < 0 || Object.is(inputVal, -0) ? 1 : 0;
    const absVal = Math.abs(inputVal);

    let html = '<p class="step-title">Step 1: Determine Sign</p>';
    html += `<p>${inputVal} is ${sign === 0 ? 'positive' : 'negative'} → Sign bit = <span class="bit-string sign-bits">${sign}</span></p>`;

    const intPart  = Math.trunc(absVal);
    const fracPart = absVal - intPart;

    /* Integer part */
    html += `<p class="step-title">Step 2: Convert Integer Part (${intPart})</p>`;
    if (intPart === 0) {
        html += '<p>Integer part is 0 → binary: <span class="bit-string">0</span></p>';
    } else {
        let q = intPart;
        const remainders = [];
        let tableHtml = '<table class="math-table"><tr><th>Division</th><th>Quotient</th><th>Remainder</th></tr>';
        while (q > 0) {
            const r = q % 2;
            const newQ = Math.floor(q / 2);
            tableHtml += `<tr><td>${q} ÷ 2</td><td>${newQ}</td><td class="remainder">${r}</td></tr>`;
            remainders.push(r);
            q = newQ;
            if (remainders.length > 64) break;
        }
        tableHtml += '</table>';
        html += tableHtml;
        remainders.reverse();
        html += `<p>Integer part in binary: <span class="bit-string">${remainders.join('')}</span></p>`;
    }

    /* Fractional part */
    html += `<p class="step-title">Step 3: Convert Fractional Part (${fracPart})</p>`;
    if (fracPart === 0) {
        html += '<p>No fractional part.</p>';
    } else {
        let f = fracPart;
        const fracBits = [];
        let tableHtml = '<table class="math-table"><tr><th>Multiplication</th><th>Result</th><th>Integer Bit</th></tr>';
        let isRepeating = false;
        for (let i = 0; i < Math.min(mantissaBits + 10, 60); i++) {
            const product = f * 2;
            const bit = Math.floor(product);
            fracBits.push(bit);
            tableHtml += `<tr><td>${toPrecisionString(f, 10)} × 2</td><td>${toPrecisionString(product, 10)}</td><td class="carry">${bit}</td></tr>`;
            f = product - bit;
            if (f === 0) break;
            if (i === mantissaBits + 9) isRepeating = true;
        }
        tableHtml += '</table>';
        html += tableHtml;
        html += `<p>Fractional part in binary: <span class="bit-string">.${fracBits.join('')}${isRepeating ? '…' : ''}</span></p>`;
        if (isRepeating) {
            html += '<p class="note">This fraction produces an infinitely repeating binary pattern — it cannot be stored exactly.</p>';
        }
    }

    /* Combine */
    const intBin = intPart === 0 ? '0' : intPart.toString(2);
    let fracBin = '';
    if (fracPart !== 0) {
        let f = fracPart;
        for (let i = 0; i < mantissaBits + 5; i++) {
            const product = f * 2;
            fracBin += Math.floor(product);
            f = product - Math.floor(product);
            if (f === 0) break;
        }
    }
    const combined = intBin + (fracBin ? '.' + fracBin : '.0');

    html += '<p class="step-title">Step 4: Combined Binary</p>';
    html += `<p>${absVal} = <span class="bit-string">${combined}</span><sub>2</sub></p>`;

    /* Normalize */
    let exponent, normalizedMantissa;
    if (intPart > 0) {
        exponent = intBin.length - 1;
        normalizedMantissa = intBin.substring(1) + fracBin;
    } else {
        let firstOne = fracBin.indexOf('1');
        if (firstOne === -1) firstOne = 0;
        exponent = -(firstOne + 1);
        normalizedMantissa = fracBin.substring(firstOne + 1);
    }

    html += '<p class="step-title">Step 5: Normalize to Scientific Notation</p>';
    html += `<p><span class="bit-string">${combined}</span> = 1.${normalizedMantissa || '0'} × 2<sup>${exponent}</sup></p>`;

    /* Biased exponent */
    const biasedExp = exponent + bias;
    const expBinary = biasedExp.toString(2).padStart(isDouble ? 11 : 8, '0');

    html += '<p class="step-title">Step 6: Calculate Biased Exponent</p>';
    html += `<p>Exponent = ${exponent}, Bias = ${bias}</p>`;
    html += `<p>Biased exponent = ${exponent} + ${bias} = ${biasedExp}</p>`;
    html += `<p>In binary (${isDouble ? 11 : 8} bits): <span class="bit-string exp-bits">${expBinary}</span></p>`;

    /* Mantissa */
    const storedMantissa = normalizedMantissa.padEnd(mantissaBits, '0').substring(0, mantissaBits);

    html += '<p class="step-title">Step 7: Extract Mantissa</p>';
    html += `<p>From 1.<span class="bit-string">${normalizedMantissa || '0'}</span>, drop the implicit leading "1."</p>`;
    html += `<p>Stored mantissa (${mantissaBits} bits): <span class="bit-string mant-bits">${storedMantissa}</span></p>`;

    html += '<p class="step-title">Step 8: Assemble IEEE 754 Representation</p>';
    html += `<p>Sign(1) | Exponent(${isDouble ? 11 : 8}) | Mantissa(${mantissaBits})</p>`;
    html += `<div class="result-box"><span class="bit-string sign-bits">${sign}</span> <span class="bit-string exp-bits">${expBinary}</span> <span class="bit-string mant-bits">${storedMantissa}</span></div>`;

    sections.push({ title: 'Conversion Steps', badge: `${isDouble ? 'Double' : 'Float'} Encoding`, content: html });
    return sections;
}


/* ==========================================================================
   12. CLIPBOARD UTILITIES
   ========================================================================== */

function copyField(field, event) {
    let text;
    switch (field) {
        case 'binary':  text = getRawBinaryString(state.bits); break;
        case 'hex':     text = getHexString(state.bits); break;
        case 'octal':   text = getOctalString(state.bits); break;
        case 'decimal': text = bitsToDecimalString(state.bits); break;
    }
    doCopy(text, event.currentTarget);
}

function copyJsonBreakdown() {
    const cfg    = TYPE_CONFIG[state.dataType];
    const decStr = bitsToDecimalString(state.bits);
    const obj = {
        input:        state.inputRaw,
        dataType:     getDataTypeLabel(),
        signConfig:   cfg.isFloat ? 'IEEE 754 (Signed)' : (state.isSigned ? 'Signed' : 'Unsigned'),
        decimalValue: decStr,
        binary:       getRawBinaryString(state.bits),
        hexadecimal:  getHexString(state.bits),
        octal:        getOctalString(state.bits),
        bitWidth:     cfg.bits,
    };

    if (cfg.isFloat) {
        const expBits = state.bits.slice(1, 1 + cfg.expBits);
        const manBits = state.bits.slice(1 + cfg.expBits);
        const expVal  = parseInt(expBits.join(''), 2);
        obj.fields = {
            sign:     { bits: String(state.bits[0]), meaning: state.bits[0] === 0 ? 'Positive' : 'Negative' },
            exponent: { bits: expBits.join(''), biased: expVal, unbiased: expVal - cfg.bias, bias: cfg.bias },
            mantissa: { bits: manBits.join(''), bitCount: manBits.length },
        };
    } else if (state.isSigned) {
        obj.fields = {
            sign:     { bit: String(state.bits[0]), meaning: state.bits[0] === 0 ? 'Positive / Zero' : 'Negative' },
            dataBits: state.bits.slice(1).join(''),
        };
    }

    doCopy(JSON.stringify(obj, null, 2), document.getElementById('jsonCopyBtn'));
}

function doCopy(text, btn) {
    navigator.clipboard.writeText(text).then(() => {
        if (btn) {
            btn.classList.add('copied');
            const original = btn.innerHTML;
            btn.innerHTML = '✓ Copied';
            setTimeout(() => { btn.classList.remove('copied'); btn.innerHTML = original; }, 1500);
        }
    }).catch(() => {
        showToast('Failed to copy — try manually.', 'warning');
    });
}


/* ==========================================================================
   13. TOAST NOTIFICATIONS
   ========================================================================== */

function showToast(message, type = 'info') {
    const container = document.getElementById('toast-container');
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.textContent = message;
    container.appendChild(toast);
    requestAnimationFrame(() => toast.classList.add('show'));
    setTimeout(() => {
        toast.classList.remove('show');
        setTimeout(() => toast.remove(), 400);
    }, 3500);
}


/* ==========================================================================
   14. SMART LOGIC GUARDS
   ========================================================================== */

function applySmartGuards(raw) {
    const cfg = TYPE_CONFIG[state.dataType];
    const trimmed = raw.trim().toLowerCase();

    if (!cfg.isFloat) {
        // Special float-only literals
        if (['nan','infinity','+infinity','-infinity','inf','+inf','-inf'].includes(trimmed)) {
            switchDataType('float');
            showToast(`"${raw.trim()}" is a floating-point special value. Switched to Float.`, 'info');
            return;
        }
        // Has fractional part
        const numVal = Number(raw);
        if (!isNaN(numVal) && isFinite(numVal) && numVal !== Math.trunc(numVal)) {
            switchDataType('float');
            showToast('Integers cannot hold fractions. Switched data type to Float.', 'info');
            return;
        }
    }
}

function switchDataType(type) {
    state.dataType = type;
    $dataType.value = type;
    updateSignToggle();
    updateRangeDisplay();
    renderLegend();
}


/* ==========================================================================
   15. SIGN TOGGLE & DATA TYPE LOGIC
   ========================================================================== */

function updateSignToggle() {
    const cfg = TYPE_CONFIG[state.dataType];
    if (cfg.isFloat) {
        $btnUnsigned.classList.add('disabled');
        $btnSigned.classList.add('active');
        $btnUnsigned.classList.remove('active');
        state.isSigned = true;
        $signNote.style.display = 'block';
    } else {
        $btnUnsigned.classList.remove('disabled');
        $signNote.style.display = 'none';
    }
}

function getDataTypeLabel() {
    const labels = {
        byte: 'Byte (8-bit)', short: 'Short (16-bit)', int: 'Int (32-bit)',
        long: 'Long (64-bit)', float: 'Float (32-bit)', double: 'Double (64-bit)',
    };
    return labels[state.dataType] || state.dataType;
}


/* ==========================================================================
   16. MAIN UPDATE PIPELINE
   ========================================================================== */

function processInput() {
    if (state.suppressInputSync) return;

    const raw = $input.value.trim();
    state.inputRaw = raw || '0';

    applySmartGuards(state.inputRaw);

    state.bits = inputToBits(state.inputRaw);

    updateRangeDisplay();
    renderLegend();
    updateDisplays();
}

function onDataTypeChange() {
    state.dataType = $dataType.value;
    updateSignToggle();
    processInput();
}

function onSignToggle(isSigned) {
    if (TYPE_CONFIG[state.dataType].isFloat) return;
    state.isSigned = isSigned;
    $btnSigned.classList.toggle('active', isSigned);
    $btnUnsigned.classList.toggle('active', !isSigned);
    processInput();
}


/* ==========================================================================
   17. EVENT BINDING & INITIALISATION
   ========================================================================== */

$input.addEventListener('input', processInput);
$input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); processInput(); }
});

$dataType.addEventListener('change', onDataTypeChange);

$btnSigned.addEventListener('click',   () => onSignToggle(true));
$btnUnsigned.addEventListener('click', () => onSignToggle(false));

// Bootstrap
(function init() {
    $input.value    = '0';
    state.inputRaw  = '0';
    state.dataType  = 'int';
    state.isSigned  = true;
    updateSignToggle();
    processInput();
})();
