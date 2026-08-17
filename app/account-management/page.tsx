"use client";

import { ChangeEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import PageWrapper from "@/components/PageWrapper";
import LoadingSpinner from "@/components/LoadingSpinner";
import Toast from "@/components/Toast";
import { clearAuth } from "@/lib/clientAuth";
import { requireAuthenticated } from "@/lib/frontendAccess";
import { usePageState } from "@/hooks/usePageState";
import { runMutation } from "@/lib/runMutation";
import {
  fetchMyProfile,
  updateMyProfile,
  changeMyPassword,
  deactivateMyAccount,
  deleteMyAccount,
} from "@/lib/profileTrustClient";

type UserProfile = {
  username: string;
  bio?: string;
  avatarUrl?: string;
};

const MAX_AVATAR_FILE_SIZE_BYTES = 512 * 1024;
const ACCEPTED_AVATAR_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
]);

export default function AccountManagementPage() {
  const router = useRouter();
  const {
    loading,
    setLoading,
    message,
    messageType,
    showSuccess,
    showError,
    clearMessage,
  } = usePageState();

  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmNewPassword, setConfirmNewPassword] = useState("");
  const [username, setUsername] = useState("");
  const [bio, setBio] = useState("");
  const [avatarUrl, setAvatarUrl] = useState("");
  const [savingProfile, setSavingProfile] = useState(false);
  const [savingAvatar, setSavingAvatar] = useState(false);
  const [savingPassword, setSavingPassword] = useState(false);
  const [accountPassword, setAccountPassword] = useState("");
  const [deleteConfirmationText, setDeleteConfirmationText] = useState("");
  const [deactivatingAccount, setDeactivatingAccount] = useState(false);
  const [deletingAccount, setDeletingAccount] = useState(false);

  useEffect(() => {
    void loadAccountPage();
  }, []);

  async function loadAccountPage() {
    try {
      setLoading(true);
      clearMessage();

      const user = await requireAuthenticated(router);
      if (!user) return;

      const profileData = await fetchMyProfile();
      setUsername(profileData.user?.username || "");
      setBio(profileData.user?.bio || "");
      setAvatarUrl(profileData.user?.avatarUrl || "");
    } catch (error: any) {
      showError(error?.response?.data?.message || "Failed to load account settings.");
    } finally {
      setLoading(false);
    }
  }

  async function saveProfileDetails() {
    const trimmedUsername = username.trim();

    if (!trimmedUsername) {
      showError("Username is required.");
      return;
    }

    setSavingProfile(true);

    await runMutation({
      action: () =>
        updateMyProfile({
          username: trimmedUsername,
          bio: bio.trim(),
          avatarUrl: avatarUrl.trim(),
        }),
      onSuccess: (data: { user: UserProfile }) => {
        setUsername(data.user?.username || trimmedUsername);
        setBio(data.user?.bio || "");
        setAvatarUrl(data.user?.avatarUrl || "");
        showSuccess("Account details updated successfully.");
      },
      onError: showError,
      onFinally: () => setSavingProfile(false),
    });
  }

  function handleAvatarFileChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];

    if (!file) {
      return;
    }

    if (!ACCEPTED_AVATAR_TYPES.has(file.type)) {
      showError("Upload a JPG, PNG, WEBP, or GIF image.");
      event.target.value = "";
      return;
    }

    if (file.size > MAX_AVATAR_FILE_SIZE_BYTES) {
      showError("Avatar image must be 512 KB or smaller.");
      event.target.value = "";
      return;
    }

    const reader = new FileReader();

    reader.onload = () => {
      const result = typeof reader.result === "string" ? reader.result : "";

      if (!result.startsWith("data:image/")) {
        showError("Failed to read the selected image.");
        return;
      }

      setAvatarUrl(result);
      setSavingAvatar(true);

      void runMutation({
        action: () =>
          updateMyProfile({
            username: username.trim(),
            bio: bio.trim(),
            avatarUrl: result,
          }),
        onSuccess: (data: { user: UserProfile }) => {
          setUsername(data.user?.username || username.trim());
          setBio(data.user?.bio || "");
          setAvatarUrl(data.user?.avatarUrl || result);
          showSuccess("Profile picture updated successfully.");
        },
        onError: showError,
        onFinally: () => setSavingAvatar(false),
      });
    };

    reader.onerror = () => {
      showError("Failed to read the selected image.");
    };

    reader.readAsDataURL(file);
    event.target.value = "";
  }

  async function removeAvatar() {
    if (!avatarUrl) {
      return;
    }

    setSavingAvatar(true);

    await runMutation({
      action: () =>
        updateMyProfile({
          username: username.trim(),
          bio: bio.trim(),
          avatarUrl: "",
        }),
      onSuccess: (data: { user: UserProfile }) => {
        setUsername(data.user?.username || username.trim());
        setBio(data.user?.bio || "");
        setAvatarUrl("");
        showSuccess("Profile picture removed successfully.");
      },
      onError: showError,
      onFinally: () => setSavingAvatar(false),
    });
  }

  async function savePassword() {
    const trimmedCurrentPassword = currentPassword.trim();
    const trimmedNewPassword = newPassword.trim();
    const trimmedConfirmPassword = confirmNewPassword.trim();

    if (!trimmedCurrentPassword || !trimmedNewPassword || !trimmedConfirmPassword) {
      showError("Current password, new password, and confirmation are required.");
      return;
    }

    if (trimmedNewPassword.length < 8) {
      showError("New password must be at least 8 characters.");
      return;
    }

    if (trimmedNewPassword !== trimmedConfirmPassword) {
      showError("New password and confirmation must match.");
      return;
    }

    setSavingPassword(true);

    await runMutation({
      action: () =>
        changeMyPassword({
          currentPassword: trimmedCurrentPassword,
          newPassword: trimmedNewPassword,
        }),
      onSuccess: () => {
        setCurrentPassword("");
        setNewPassword("");
        setConfirmNewPassword("");
        showSuccess("Password updated successfully.");
      },
      onError: showError,
      onFinally: () => setSavingPassword(false),
    });
  }

  async function deactivateAccount() {
    const password = accountPassword.trim();
    if (!password) {
      showError("Enter your password to deactivate your account.");
      return;
    }

    const confirmed = window.confirm(
      "Deactivate this account? You will be signed out and login will be blocked until the account is restored."
    );
    if (!confirmed) return;

    setDeactivatingAccount(true);

    await runMutation({
      action: () => deactivateMyAccount(password),
      onSuccess: () => {
        clearAuth();
        router.push("/login");
      },
      onError: showError,
      onFinally: () => setDeactivatingAccount(false),
    });
  }

  async function deleteAccount() {
    const password = accountPassword.trim();
    if (!password) {
      showError("Enter your password to delete your account.");
      return;
    }

    if (deleteConfirmationText.trim() !== "DELETE") {
      showError("Type DELETE to confirm permanent account deletion.");
      return;
    }

    const confirmed = window.confirm(
      "Delete this account permanently? This will remove your account and associated records and cannot be undone."
    );
    if (!confirmed) return;

    setDeletingAccount(true);

    await runMutation({
      action: () => deleteMyAccount(password),
      onSuccess: () => {
        clearAuth();
        router.push("/login");
      },
      onError: showError,
      onFinally: () => setDeletingAccount(false),
    });
  }

  return (
    <PageWrapper
      title="Account Management"
      subtitle="Update your account details, password, or close your account with stronger confirmation controls."
    >
      {message && <Toast message={message} type={messageType} />}

      {loading ? (
        <LoadingSpinner label="Loading account settings..." />
      ) : (
        <div className="space-y-6">
          <div className="flex justify-end">
            <button
              onClick={() => router.push("/profile")}
              className="vv-btn-secondary"
            >
              Back to Profile
            </button>
          </div>

          <div className="vv-card p-5">
            <h2 className="vv-section-title mb-4">Profile Details</h2>

            <div className="mb-5 flex flex-col gap-4 sm:flex-row sm:items-center">
              <div className="flex w-24 flex-col items-center">
                <label className="group relative block h-24 w-24 cursor-pointer overflow-hidden rounded-full border border-slate-300 bg-slate-100">
                  {avatarUrl ? (
                    <img
                      src={avatarUrl}
                      alt={username || "Profile picture"}
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center text-2xl text-slate-500">
                      {(username || "U").slice(0, 1).toUpperCase()}
                    </div>
                  )}

                  <div className="absolute inset-0 flex items-center justify-center bg-slate-900/0 text-center text-[10px] font-medium leading-tight text-white transition group-hover:bg-slate-900/55">
                    <span className="px-2 opacity-0 transition group-hover:opacity-100">
                      {avatarUrl ? "Change photo" : "Upload photo"}
                    </span>
                  </div>

                  <input
                    className="sr-only"
                    type="file"
                    accept="image/png,image/jpeg,image/webp,image/gif"
                    onChange={handleAvatarFileChange}
                  />
                </label>

                {savingAvatar && (
                  <p className="mt-2 text-center text-[10px] text-slate-500">Updating...</p>
                )}

                {avatarUrl && (
                  <button
                    type="button"
                    onClick={removeAvatar}
                    disabled={savingAvatar}
                    aria-busy={savingAvatar}
                    className="mt-2 text-center text-[11px] font-medium text-amber-700 transition hover:text-amber-800 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    Remove photo
                  </button>
                )}
              </div>

              <div className="flex-1">
                <label className="vv-label block mb-1">Username</label>
                <input
                  className="vv-input"
                  type="text"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  autoComplete="username"
                  placeholder="Choose a username"
                />
              </div>
            </div>

            <div className="mb-4">
              <label className="vv-label block mb-1">Bio</label>
              <textarea
                className="vv-textarea"
                rows={4}
                value={bio}
                onChange={(e) => setBio(e.target.value)}
                placeholder="Tell people who you are and what you care about."
              />
            </div>

            <button
              onClick={saveProfileDetails}
              disabled={savingProfile || savingAvatar}
              aria-busy={savingProfile}
              className="vv-btn-primary"
            >
              {savingProfile ? "Updating..." : "Save Profile Details"}
            </button>
          </div>

          <div className="vv-card p-5">
            <h2 className="vv-section-title mb-4">Change Password</h2>

            <div className="mb-4">
              <label className="vv-label block mb-1">Current Password</label>
              <input
                className="vv-input"
                type="password"
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                autoComplete="current-password"
                placeholder="Enter your current password"
              />
            </div>

            <div className="mb-4">
              <label className="vv-label block mb-1">New Password</label>
              <input
                className="vv-input"
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                autoComplete="new-password"
                placeholder="At least 8 characters"
              />
            </div>

            <div className="mb-4">
              <label className="vv-label block mb-1">Confirm New Password</label>
              <input
                className="vv-input"
                type="password"
                value={confirmNewPassword}
                onChange={(e) => setConfirmNewPassword(e.target.value)}
                autoComplete="new-password"
                placeholder="Re-enter your new password"
              />
            </div>

            <p className="text-xs text-slate-500 mb-4">
              Passwords must be at least 8 characters and different from your current password.
            </p>

            <button
              onClick={savePassword}
              disabled={savingPassword}
              aria-busy={savingPassword}
              className="vv-btn-primary"
            >
              {savingPassword ? "Updating..." : "Update Password"}
            </button>

            <div className="mt-4">
              <button
                onClick={() => router.push("/forgot-password")}
                className="text-sm font-medium text-amber-700 transition hover:text-amber-800"
              >
                Forgot password?
              </button>
            </div>
          </div>

          <div className="vv-card p-5 border border-red-200/80">
            <h2 className="vv-section-title mb-4">Deactivate Or Delete Account</h2>

            <div className="mb-4">
              <label className="vv-label block mb-1">Confirm Password</label>
              <input
                className="vv-input"
                type="password"
                value={accountPassword}
                onChange={(e) => setAccountPassword(e.target.value)}
                autoComplete="current-password"
                placeholder="Enter your password to continue"
              />
            </div>

            <p className="mb-4 text-sm text-slate-600">
              Deactivating signs you out and blocks future login until the account is restored. Deleting removes your account and associated records permanently.
            </p>

            <div className="mb-4">
              <label className="vv-label block mb-1">Delete Confirmation</label>
              <input
                className="vv-input"
                type="text"
                value={deleteConfirmationText}
                onChange={(e) => setDeleteConfirmationText(e.target.value)}
                placeholder="Type DELETE to enable permanent deletion"
                autoComplete="off"
              />
              <p className="mt-2 text-xs text-slate-500">
                Permanent deletion requires typing DELETE exactly.
              </p>
            </div>

            <div className="flex flex-wrap gap-2">
              <button
                onClick={deactivateAccount}
                disabled={deactivatingAccount || deletingAccount}
                aria-busy={deactivatingAccount}
                className="vv-btn-secondary"
              >
                {deactivatingAccount ? "Deactivating..." : "Deactivate Account"}
              </button>

              <button
                onClick={deleteAccount}
                disabled={
                  deletingAccount ||
                  deactivatingAccount ||
                  deleteConfirmationText.trim() !== "DELETE"
                }
                aria-busy={deletingAccount}
                className="vv-btn-danger"
              >
                {deletingAccount ? "Deleting..." : "Delete Account"}
              </button>
            </div>
          </div>
        </div>
      )}
    </PageWrapper>
  );
}