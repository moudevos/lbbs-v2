export type PasswordPolicyResult = {
  valid: boolean;
  errors: string[];
  requirements: Array<{ key: string; label: string; valid: boolean }>;
  strength: "weak" | "medium" | "strong";
};

export function validatePasswordPolicy(password: string): PasswordPolicyResult {
  const requirements = [
    { key: "length", label: "Al menos 8 caracteres", valid: password.length >= 8 },
    { key: "uppercase", label: "Una letra mayúscula", valid: /[A-Z]/.test(password) },
    { key: "lowercase", label: "Una letra minúscula", valid: /[a-z]/.test(password) },
    { key: "number", label: "Un número", valid: /\d/.test(password) },
    { key: "symbol", label: "Un símbolo", valid: /[^A-Za-z0-9\s]/.test(password) },
  ];
  const valid = requirements.every((item) => item.valid);
  const score = requirements.filter((item) => item.valid).length;
  return {
    valid,
    requirements,
    errors: requirements.filter((item) => !item.valid).map((item) => item.label),
    strength: score <= 2 ? "weak" : score <= 4 ? "medium" : "strong",
  };
}
