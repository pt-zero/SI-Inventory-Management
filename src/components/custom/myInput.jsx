import { useState } from "react";
import "./myInput.css";

function MyInput({
  type = "text",
  value,
  onChange,
  label,
  layout = "stacked",
  id,
  placeholder,
  helperText,
  error,
  success,
  disabled = false,
  size = "medium",
  className = "",
  ...rest
}) {
  const [showPassword, setShowPassword] = useState(false);
  const isPassword = type === "password";

  const groupClasses = [
    "my-input-group",
    size === "small" && "my-input-group--small",
    layout === "inline" && "my-input-group--inline",
    error && "my-input-group--error",
    success && "my-input-group--success",
    className,
  ]
    .filter(Boolean)
    .join(" ");

  const inputClasses = [
    "my-input-field",
    size === "small" && "my-input-field--small",
  ]
    .filter(Boolean)
    .join(" ");

  const handleChange = (event) => {
    if (onChange) {
      onChange(event.target.value);
    }
  };

  const inputType = isPassword ? (showPassword ? "text" : "password") : type;

  return (
    <div className={groupClasses}>
      {label && (
        <label htmlFor={id} className={`my-input-label ${size === "small" ? "my-input-label--small" : ""}`}>
          {label}
        </label>
      )}

      {isPassword ? (
        <div className="my-input-wrapper">
          <input
            id={id}
            type={inputType}
            className={inputClasses}
            value={value}
            onChange={handleChange}
            placeholder={placeholder}
            disabled={disabled}
            {...rest}
          />
          <button
            type="button"
            className={`my-input-toggle ${size === "small" ? "my-input-toggle--small" : ""}`}
            onClick={() => setShowPassword((current) => !current)}
            aria-label={showPassword ? "Hide password" : "Show password"}
          >
            {showPassword ? <EyeIcon /> : <EyeOffIcon />}
          </button>
        </div>
      ) : (
        <input
          id={id}
          type={inputType}
          className={inputClasses}
          value={value}
          onChange={handleChange}
          placeholder={placeholder}
          disabled={disabled}
          {...rest}
        />
      )}

      {helperText && !error && !success && (
        <span className={`my-input-helper ${size === "small" ? "my-input-helper--small" : ""}`}>
          {helperText}
        </span>
      )}

      {error && (
        <span className={`my-input-message my-input-message--error ${size === "small" ? "my-input-message--small" : ""}`}>
          <ErrorIcon />
          {error}
        </span>
      )}

      {success && (
        <span className={`my-input-message my-input-message--success ${size === "small" ? "my-input-message--small" : ""}`}>
          <SuccessIcon />
          {success}
        </span>
      )}
    </div>
  );
}

const EyeIcon = () => (
  <svg viewBox="0 0 24 24" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
    <circle cx="12" cy="12" r="3" />
  </svg>
);

const EyeOffIcon = () => (
  <svg viewBox="0 0 24 24" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" />
    <line x1="1" y1="1" x2="23" y2="23" />
  </svg>
);

const ErrorIcon = () => (
  <svg viewBox="0 0 16 16" strokeWidth="1.5">
    <circle cx="8" cy="8" r="7" />
    <line x1="8" y1="5" x2="8" y2="9" />
    <circle cx="8" cy="11.5" r="0.5" fill="currentColor" />
  </svg>
);

const SuccessIcon = () => (
  <svg viewBox="0 0 16 16" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="3,8 6,11 13,4" />
  </svg>
);

export default MyInput;