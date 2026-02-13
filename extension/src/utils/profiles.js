import { apiCall } from "./api";

export async function fetchProfiles() {
  try {
    const response = await apiCall("/user/profiles", {
      method: "GET",
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(
        errorData.message || `Failed to fetch profiles: ${response.status}`
      );
    }

    const data = await response.json();
    if (data.success === 1 && data.data) {
      return Array.isArray(data.data) ? data.data : [];
    }

    return [];
  } catch (error) {
    console.error("Error fetching profiles:", error);
    throw error;
  }
}

export async function createProfile(name) {
  const trimmedName = name.trim();

  if (!trimmedName) {
    throw new Error("Profile name cannot be empty");
  }

  if (trimmedName.length > 50) {
    throw new Error("Profile name must be less than 50 characters");
  }

  try {
    const response = await apiCall("/user/create-profile", {
      method: "POST",
      body: JSON.stringify({ name: trimmedName }),
    });

    if (!response.ok) {
      let errorData;
      try {
        errorData = await response.json();
      } catch (e) {
        throw new Error(
          `Server error (${response.status}): ${
            response.statusText || "Internal server error"
          }`
        );
      }

      let errorMsg = "Failed to create profile";
      if (errorData.message) {
        if (
          errorData.message.includes("alreadyExists") ||
          errorData.message.includes("already exists")
        ) {
          errorMsg = `Profile "${trimmedName}" already exists`;
        } else if (errorData.message.includes("notFound")) {
          errorMsg = "User not found. Please sign in again.";
        } else {
          errorMsg = errorData.message;
        }
      } else if (response.status >= 500) {
        errorMsg = `Server error (${response.status}). Please try again later.`;
      } else if (response.status === 401) {
        errorMsg = "Authentication expired. Please sign in again.";
      }

      throw new Error(errorMsg);
    }

    const data = await response.json();

    if (data.success === 1) {
      return data.data || { name: trimmedName };
    }

    throw new Error(data.message || "Failed to create profile");
  } catch (error) {
    console.error("Error creating profile:", error);
    if (error instanceof Error) {
      throw error;
    }
    throw new Error(error.message || "Failed to create profile");
  }
}
