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
            // Match DPAPI's randomized output so tests catch unstable settings XML.
            var result = new byte[16 + value.Length];
            Buffer.BlockCopy(Guid.NewGuid().ToByteArray(), 0, result, 0, 16);
            Buffer.BlockCopy(value, 0, result, 16, value.Length);
            return result;
#else
            return ProtectedData.Protect(value, null, DataProtectionScope.CurrentUser);
#endif
        }
        public static byte[] Unprotect(byte[] value)
        {
#if TESTING
            var result = new byte[value.Length - 16];
            Buffer.BlockCopy(value, 16, result, 0, result.Length);
            return result;
#else
            return ProtectedData.Unprotect(value, null, DataProtectionScope.CurrentUser);
#endif
        }
    }
}
