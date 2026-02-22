"""
Security utilities for file upload validation and malware scanning.
"""
import hashlib
import logging
import re
import time
from pathlib import Path
from typing import Optional

logger = logging.getLogger(__name__)

# EICAR test file signature (for testing antivirus)
EICAR_SIGNATURE = b"X5O!P%@AP[4\\PZX54(P^)7CC)7}$EICAR-STANDARD-ANTIVIRUS-TEST-FILE!$H+H*"

# PDF magic bytes
PDF_MAGIC_BYTES = b"%PDF"

# Maximum allowed file size (enforced by config, this is a fallback)
MAX_FILE_SIZE_BYTES = 100 * 1024 * 1024  # 100MB


class FileValidationError(Exception):
    """Raised when file validation fails."""
    pass


class RateLimitExceeded(Exception):
    """Raised when rate limit is exceeded."""
    pass


class RateLimiter:
    """
    Simple in-memory rate limiter for file uploads.
    In production, use Redis for distributed rate limiting.
    """
    
    def __init__(self, max_uploads: int = 10, window_seconds: int = 3600):
        """
        Args:
            max_uploads: Maximum number of uploads allowed per window
            window_seconds: Time window in seconds (default: 1 hour)
        """
        self.max_uploads = max_uploads
        self.window_seconds = window_seconds
        self.uploads = {}  # {ip_address: [(timestamp, filename), ...]}
    
    def check_rate_limit(self, identifier: str, filename: str) -> None:
        """
        Check if the identifier (e.g., IP address) has exceeded rate limit.
        
        Args:
            identifier: Unique identifier (IP address, user ID, etc.)
            filename: Name of file being uploaded (for logging)
            
        Raises:
            RateLimitExceeded: If rate limit is exceeded
        """
        now = time.time()
        
        # Clean up old entries
        if identifier in self.uploads:
            self.uploads[identifier] = [
                (ts, fn) for ts, fn in self.uploads[identifier]
                if now - ts < self.window_seconds
            ]
        
        # Check current count
        current_count = len(self.uploads.get(identifier, []))
        
        if current_count >= self.max_uploads:
            logger.warning(
                f"Rate limit exceeded for {identifier}: "
                f"{current_count} uploads in last {self.window_seconds}s"
            )
            raise RateLimitExceeded(
                f"Upload rate limit exceeded. Maximum {self.max_uploads} uploads "
                f"per {self.window_seconds // 3600} hour(s)."
            )
        
        # Record this upload
        if identifier not in self.uploads:
            self.uploads[identifier] = []
        self.uploads[identifier].append((now, filename))
        
        logger.info(
            f"Rate limit check passed for {identifier}: "
            f"{current_count + 1}/{self.max_uploads} uploads"
        )


# Global rate limiter instance
rate_limiter = RateLimiter(max_uploads=10, window_seconds=3600)


def sanitize_filename(filename: str) -> str:
    """
    Sanitize filename to prevent path traversal and special character issues.
    
    Args:
        filename: Original filename
        
    Returns:
        Sanitized filename (safe for use in file paths)
    """
    if not filename:
        raise FileValidationError("Filename cannot be empty")
    
    # Remove path components (prevent directory traversal)
    filename = Path(filename).name
    
    # Remove or replace dangerous characters
    # Keep only alphanumeric, dash, underscore, period
    filename = re.sub(r'[^a-zA-Z0-9._-]', '_', filename)
    
    # Remove leading/trailing dots and spaces
    filename = filename.strip('. ')
    
    # Prevent double extensions and suspicious patterns
    filename = re.sub(r'\.{2,}', '.', filename)
    
    # Ensure reasonable length
    if len(filename) > 255:
        name, ext = filename.rsplit('.', 1) if '.' in filename else (filename, '')
        filename = name[:250] + ('.' + ext if ext else '')
    
    if not filename or filename == '.' or filename == '..':
        raise FileValidationError("Invalid filename after sanitization")
    
    return filename


def validate_pdf_magic_bytes(file_bytes: bytes) -> None:
    """
    Validate that the file is actually a PDF by checking magic bytes.
    
    Args:
        file_bytes: Raw file content
        
    Raises:
        FileValidationError: If the file is not a valid PDF
    """
    if len(file_bytes) < 4:
        raise FileValidationError("File too small to be a valid PDF")
    
    if not file_bytes.startswith(PDF_MAGIC_BYTES):
        # Log the actual bytes for debugging
        actual_bytes = file_bytes[:8].hex()
        logger.warning(f"Invalid PDF magic bytes: {actual_bytes}")
        raise FileValidationError(
            "File is not a valid PDF. Expected PDF magic bytes but found different file type."
        )
    
    logger.debug("PDF magic bytes validated successfully")


def scan_for_malware(file_bytes: bytes, filename: str) -> None:
    """
    Scan file for malware signatures.
    
    Currently checks for:
    - EICAR test file (standard antivirus test)
    - Suspicious PDF patterns (e.g., JavaScript, AutoOpen actions)
    
    In production, integrate with ClamAV or cloud scanning service like:
    - VirusTotal API
    - AWS GuardDuty Malware Protection
    - Cloudflare Workers with ClamAV
    
    Args:
        file_bytes: Raw file content
        filename: Original filename (for logging)
        
    Raises:
        FileValidationError: If malware is detected
    """
    # Check for EICAR test file
    if EICAR_SIGNATURE in file_bytes:
        logger.error(f"EICAR test file detected in upload: {filename}")
        raise FileValidationError(
            "Malware signature detected. File rejected for security reasons."
        )
    
    # Check for suspicious PDF patterns
    file_lower = file_bytes.lower()
    
    suspicious_patterns = [
        (b'/javascript', "JavaScript"),
        (b'/js ', "JavaScript"),
        (b'/launch', "Launch action"),
        (b'/aa', "AutoOpen action"),
        (b'/openaction', "OpenAction"),
        (b'/embeddedfile', "Embedded file"),
    ]
    
    for pattern, name in suspicious_patterns:
        if pattern in file_lower:
            logger.warning(
                f"Suspicious PDF pattern detected in {filename}: {name}"
            )
            # Note: Not raising error by default as legitimate PDFs may have these
            # In production, use more sophisticated analysis or send to sandbox
    
    logger.debug(f"Malware scan passed for {filename}")


def validate_file_upload(
    file_bytes: bytes,
    filename: str,
    max_size_bytes: int = MAX_FILE_SIZE_BYTES,
    client_ip: Optional[str] = None
) -> str:
    """
    Comprehensive file upload validation.
    
    Performs:
    1. Filename sanitization
    2. File size validation
    3. Magic byte validation (file type)
    4. Malware scanning
    5. Rate limiting (if client_ip provided)
    
    Args:
        file_bytes: Raw file content
        filename: Original filename
        max_size_bytes: Maximum allowed file size
        client_ip: Client IP address for rate limiting (optional)
        
    Returns:
        Sanitized filename
        
    Raises:
        FileValidationError: If validation fails
        RateLimitExceeded: If rate limit exceeded
    """
    # 1. Sanitize filename
    safe_filename = sanitize_filename(filename)
    logger.info(f"Validating upload: {filename} -> {safe_filename}")
    
    # 2. Check file size
    file_size = len(file_bytes)
    if file_size > max_size_bytes:
        logger.warning(
            f"File size exceeded: {file_size} bytes > {max_size_bytes} bytes"
        )
        raise FileValidationError(
            f"File exceeds maximum size of {max_size_bytes // (1024 * 1024)}MB"
        )
    
    logger.debug(f"File size validated: {file_size} bytes")
    
    # 3. Validate PDF magic bytes
    validate_pdf_magic_bytes(file_bytes)
    
    # 4. Scan for malware
    scan_for_malware(file_bytes, safe_filename)
    
    # 5. Rate limiting (if IP provided)
    if client_ip:
        rate_limiter.check_rate_limit(client_ip, safe_filename)
    
    # Calculate file hash for logging
    file_hash = hashlib.sha256(file_bytes).hexdigest()[:16]
    logger.info(
        f"File upload validated successfully: {safe_filename} "
        f"({file_size} bytes, hash: {file_hash})"
    )
    
    return safe_filename
