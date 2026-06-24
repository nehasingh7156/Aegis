import React, { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import {
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut,
  sendEmailVerification,
  fetchSignInMethodsForEmail
} from "firebase/auth";

import { auth, googleProvider } from "@/firebase";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  LogIn,
  Mail,
  Lock,
  Loader2,
  Eye,
  EyeOff
} from "lucide-react";
import AuthLayout from "@/components/AuthLayout";
import GoogleIcon from "@/components/GoogleIcon";
import { mapAuthError } from "@/utils/authErrors";

export default function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  
  // Resend verification states
  const [storedEmail, setStoredEmail] = useState("");
  const [showResend, setShowResend] = useState(false);
  const [resendCooldown, setResendCooldown] = useState(0);
  const [canResend, setCanResend] = useState(true);

  // Restore cooldown state on mount
  useEffect(() => {
    const endTimeStr = localStorage.getItem("resend_cooldown_end");
    if (endTimeStr) {
      const endTime = parseInt(endTimeStr, 10);
      const remaining = Math.ceil((endTime - Date.now()) / 1000);
      if (remaining > 0) {
        setResendCooldown(remaining);
        setCanResend(false);
      }
    }
  }, []);

  // Cooldown countdown effect
  useEffect(() => {
    let timer;
    if (resendCooldown > 0) {
      timer = setInterval(() => {
        setResendCooldown((prev) => {
          if (prev <= 1) {
            clearInterval(timer);
            setCanResend(true);
            localStorage.removeItem("resend_cooldown_end");
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    } else {
      setCanResend(true);
    }
    return () => clearInterval(timer);
  }, [resendCooldown]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setSuccess("");
    setLoading(true);
    try {
      const credential = await signInWithEmailAndPassword(
        auth,
        email,
        password
      );
      
      if (!credential.user.emailVerified) {
        setStoredEmail(email);
        console.log(
          "[VERIFY EMAIL Login] About to send",
          credential.user.uid,
          credential.user.email
        );
        try {
          await sendEmailVerification(credential.user);
          console.log(
            "[VERIFY EMAIL Login] Sent successfully",
            credential.user.uid,
            credential.user.email
          );
        } catch (sendErr) {
          console.error(
            "[VERIFY EMAIL Login] Failed",
            sendErr.code,
            sendErr.message,
            sendErr
          );
        }
        await signOut(auth);
        setError("Your email address has not been verified. Please verify your email before signing in.");
        setShowResend(true);
        return;
      }
      
      window.location.href = "/";
    } catch (err) {
      if (err.code === "auth/invalid-credential" || err.code === "auth/wrong-password" || err.code === "auth/user-not-found") {
        try {
          const signInMethods = await fetchSignInMethodsForEmail(auth, email);
          console.log("[Aegis Auth Diagnostics] Login credential failure - email:", email, "signInMethods:", signInMethods);
        } catch (fetchErr) {
          console.error("[Aegis Auth Diagnostics] Failed to fetch sign-in methods on login error:", fetchErr);
        }
      }
      setError(mapAuthError(err));
    } finally {
      setLoading(false);
    }
  };

  const handleResendVerification = async () => {
    if (!password) {
      setError("Please enter your password to resend the verification email.");
      return;
    }
    setError("");
    setSuccess("");

    // Start 60-second cooldown
    const cooldownEndTime = Date.now() + 60000;
    localStorage.setItem("resend_cooldown_end", cooldownEndTime.toString());
    setResendCooldown(60);
    setCanResend(false);

    try {
      const credential = await signInWithEmailAndPassword(
        auth,
        storedEmail || email,
        password
      );
      console.log(
        "[VERIFY EMAIL Resend] About to send",
        credential.user.uid,
        credential.user.email
      );
      try {
        await sendEmailVerification(credential.user);
        console.log(
          "[VERIFY EMAIL Resend] Sent successfully",
          credential.user.uid,
          credential.user.email
        );
      } catch (sendErr) {
        console.error(
          "[VERIFY EMAIL Resend] Failed",
          sendErr.code,
          sendErr.message,
          sendErr
        );
        throw sendErr;
      }
      await signOut(auth);
      setSuccess("If an account exists, a verification email has been sent.");
    } catch (err) {
      console.error("AUTH ERROR CODE:", err.code);
      console.error("AUTH ERROR MESSAGE:", err.message);
      console.error(err);
      // Map error specifically for resend flow
      if (err.code === "auth/too-many-requests") {
        setError("Too many verification requests. Please try again later.");
      } else if (err.code === "auth/network-request-failed") {
        setError("Network error. Check your internet connection.");
      } else {
        setError("Failed to send verification email. Please try again.");
      }
    }
  };

  const handleGoogle = async () => {
    setError("");
    setSuccess("");
    try {
      const credential = await signInWithPopup(auth, googleProvider);
      if (!credential.user.emailVerified) {
        await sendEmailVerification(credential.user, {
          url: `${window.location.origin}/login`
        });
        await signOut(auth);
        setError("Your email address has not been verified. Please verify your email before signing in.");
        setShowResend(true);
        return;
      }
      window.location.href = "/";
    } catch (err) {
      setError(mapAuthError(err));
    }
  };

  return (
    <AuthLayout
      icon={LogIn}
      title="Welcome back"
      subtitle="Log in to your account"
      footer={
        <>
          Don't have an account?{" "}
          <Link to="/register" className="text-primary font-medium hover:underline">
            Create one
          </Link>
        </>
      }
    >
      <Button
        variant="outline"
        className="w-full h-12 text-sm font-medium mb-6"
        onClick={handleGoogle}
      >
        <GoogleIcon className="w-5 h-5 mr-2" />
        Continue with Google
      </Button>

      <div className="relative mb-6">
        <div className="absolute inset-0 flex items-center">
          <div className="w-full border-t border-border" />
        </div>
        <div className="relative flex justify-center text-xs uppercase">
          <span className="bg-card px-3 text-muted-foreground">or</span>
        </div>
      </div>

      {error && (
        <div className="mb-4 p-3 rounded-lg bg-destructive/10 text-destructive text-sm">
          {error}
        </div>
      )}

      {success && (
        <div className="mb-4 p-3 rounded-lg bg-green-500/10 text-green-600 dark:text-green-400 text-sm">
          {success}
        </div>
      )}

      {showResend && error && error.includes("not been verified") && (
        <div className="mb-4">
          <Button
            type="button"
            variant="outline"
            className="w-full h-12 text-sm font-medium"
            onClick={handleResendVerification}
            disabled={!canResend}
          >
            {canResend
              ? "Resend Verification Email"
              : `Resend available in ${resendCooldown}s`}
          </Button>
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="email">Email</Label>
          <div className="relative">
            <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" aria-hidden="true" />
            <Input
              id="email"
              type="email"
              autoComplete="email"
              autoFocus
              placeholder="you@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="pl-10 h-12"
              required
            />
          </div>
        </div>
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label htmlFor="password">Password</Label>
            <Link to="/forgot-password" className="text-xs text-primary hover:underline">
              Forgot Password?
            </Link>
          </div>
          <div className="relative">
            <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" aria-hidden="true" />
            <Input
  id="password"
  type={showPassword ? "text" : "password"}
  autoComplete="current-password"
  placeholder="••••••••"
  value={password}
  onChange={(e) => setPassword(e.target.value)}
  className="pl-10 pr-10 h-12"
  required
/>

<button
  type="button"
  onClick={() => setShowPassword(!showPassword)}
  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
>
  {showPassword ? (
    <EyeOff className="w-4 h-4" />
  ) : (
    <Eye className="w-4 h-4" />
  )}
</button>
          </div>
        </div>
        <Button type="submit" className="w-full h-12 font-medium" disabled={loading}>
          {loading ? (
            <>
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              Logging in...
            </>
          ) : (
            "Log in"
          )}
        </Button>
      </form>
    </AuthLayout>
  );
}