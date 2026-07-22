const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE_PATTERN = /^(?:\+84|0)(?:3|5|7|8|9)\d{8}$/;

function makeRule(check, message, normalize) {
  return { check, message, normalize };
}

const rules = {
  required(message) {
    return makeRule((value) => value !== undefined && value !== null && String(value).trim() !== '', message);
  },
  email(message) {
    return makeRule((value) => value === undefined || value === '' || EMAIL_PATTERN.test(String(value)), message, (value) => String(value || '').trim().toLowerCase());
  },
  minLength(length, message) {
    return makeRule((value) => value === undefined || value === null || String(value).length >= length, message);
  },
  maxLength(length, message) {
    return makeRule((value) => value === undefined || value === null || String(value).length <= length, message);
  },
  phone(message) {
    return makeRule((value) => value === undefined || value === '' || PHONE_PATTERN.test(String(value)), message, (value) => String(value || '').replace(/[.\s-]/g, ''));
  },
  pattern(pattern, message) {
    return makeRule((value) => value === undefined || value === '' || pattern.test(String(value)), message);
  },
  equalsField(field, message) {
    return makeRule((value, input) => value === input[field], message);
  },
};

function validate(input = {}, schema = {}) {
  const value = { ...input };
  const errors = [];

  for (const [field, fieldRules] of Object.entries(schema)) {
    let fieldValue = value[field];
    if (typeof fieldValue === 'string') fieldValue = fieldValue.trim();
    for (const rule of fieldRules) {
      if (rule.normalize) fieldValue = rule.normalize(fieldValue);
      if (!rule.check(fieldValue, value)) {
        errors.push({ field, message: rule.message });
        break;
      }
    }
    value[field] = fieldValue;
  }

  return { value, errors };
}

module.exports = { rules, validate };
