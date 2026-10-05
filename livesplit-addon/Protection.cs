using System;
using System.Security.Cryptography;
namespace LiveSplit.ZombiesTracker
{
    public static class Protection
    {
        public static byte[] Protect(byte[] value)
        {
#if TESTING
            // Test binary only: sandbox cannot access the interactive user's DPAPI profile.
            return value;
#else
            return ProtectedData.Protect(value, null, DataProtectionScope.CurrentUser);
#endif
        }
        public static byte[] Unprotect(byte[] value)
        {
#if TESTING
            return value;
#else
            return ProtectedData.Unprotect(value, null, DataProtectionScope.CurrentUser);
#endif
        }
    }
}
