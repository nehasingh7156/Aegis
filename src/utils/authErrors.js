export const mapAuthError = (error, isRegister = false) => {
  if (error) {
    console.error("AUTH ERROR CODE:", error.code);
    console.error("AUTH ERROR MESSAGE:", error.message);
    console.error(error);
  }
  if (!error) return "An unexpected error occurred";
  const code = error.code || "";
  
  switch (code) {
    case "auth/invalid-credential":
      return "Invalid email or password";
    case "auth/email-already-in-use":
      return isRegister 
        ? "This email is already registered. Please login instead." 
        : "Email already registered";
    case "auth/user-not-found":
      return "Account not found";
    case "auth/wrong-password":
      return "Incorrect password";
    case "auth/too-many-requests":
      return isRegister
        ? "Too many verification requests. Please try again later."
        : "Too many attempts. Try again later";
    case "auth/network-request-failed":
      return "Network error. Check internet connection";
    default:
      // Return a clean version of the message, removing Firebase prefixes if any
      return error.message ? error.message.replace(/^Firebase:\s*/, "") : "Authentication failed";
  }
};
