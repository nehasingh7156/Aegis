import React, { useState } from "react";
import { getAuth, sendEmailVerification } from "firebase/auth";
import { Button } from "@/components/ui/button";

export default function VerificationDiagnostics() {
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSendTest = async () => {
    setStatus("");
    setError("");
    setLoading(true);
    try {
      const auth = getAuth();
      const user = auth.currentUser;

      if (!user) {
        setError("No user is currently signed in. Please log in first.");
        console.warn("[Diagnostics] Cannot send test email because currentUser is null.");
        setLoading(false);
        return;
      }

      console.log("[Diagnostics] Reloading current user...");
      await user.reload();

      // Task 5 Logs
      console.log("==========================================");
      console.log("Firebase Project:", auth.app.options.projectId);
      console.log("Current user email:", user.email);
      console.log("Current user uid:", user.uid);
      console.log("Current user emailVerified:", user.emailVerified);
      console.log("Provider list:", user.providerData);
      console.log("Full User Object:", user);
      console.log("==========================================");

      console.log("[Diagnostics] Requesting verification email...");
      await sendEmailVerification(user);
      console.log("Verification email requested");
      setStatus("Verification email sent successfully! Please check your spam/inbox.");
    } catch (err) {
      console.error("[Diagnostics] Failed to send verification email:", err.code, err.message, err);
      setError(`Failed: ${err.message} (${err.code})`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="p-6 max-w-md mx-auto my-12 bg-card rounded-xl border border-border shadow-md space-y-4">
      <h2 className="text-xl font-bold text-foreground">Firebase Email Verification Diagnostics</h2>
      <p className="text-sm text-muted-foreground">
        Use this tool to test email verification delivery. Make sure you are signed in in the background.
      </p>

      {status && (
        <div className="p-3 text-sm rounded bg-green-500/10 text-green-600 dark:text-green-400">
          {status}
        </div>
      )}

      {error && (
        <div className="p-3 text-sm rounded bg-destructive/10 text-destructive">
          {error}
        </div>
      )}

      <Button
        onClick={handleSendTest}
        disabled={loading}
        className="w-full h-12 font-medium"
      >
        {loading ? "Sending..." : "Send Test Verification Email"}
      </Button>
    </div>
  );
}
