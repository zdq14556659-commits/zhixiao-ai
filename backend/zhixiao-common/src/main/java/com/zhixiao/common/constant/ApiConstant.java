package com.zhixiao.common.constant;

/**
 * API constants for the system
 */
public interface ApiConstant {

    String API_PREFIX = "/api";

    /**
     * Authentication endpoints
     */
    interface Auth {
        String PREFIX = API_PREFIX + "/auth";
        String LOGIN = "/login";
        String REGISTER = "/register";
    }

    /**
     * User endpoints
     */
    interface User {
        String PREFIX = API_PREFIX + "/users";
        String PROFILE = API_PREFIX + "/user/profile";
    }

    /**
     * Customer endpoints
     */
    interface Customer {
        String PREFIX = API_PREFIX + "/customers";
        String DETAIL = "/{id}/detail";
    }

    /**
     * Opportunity endpoints
     */
    interface Opportunity {
        String PREFIX = API_PREFIX + "/opportunities";
        String STAGE = "/{id}/stage";
    }

    /**
     * Order endpoints
     */
    interface Order {
        String PREFIX = API_PREFIX + "/orders";
    }

    /**
     * Recording endpoints
     */
    interface Recording {
        String PREFIX = API_PREFIX + "/recordings";
        String UPLOAD = "/upload";
        String TRANSCRIPT = "/{id}/transcript";
    }

    /**
     * ASR endpoints
     */
    interface Asr {
        String PREFIX = API_PREFIX + "/asr";
        String TRANSCRIBE = "/transcribe/{recordingId}";
        String STATUS = "/status/{recordingId}";
    }

    /**
     * AI endpoints
     */
    interface Ai {
        String PREFIX = API_PREFIX + "/ai";
        String ANALYZE = "/analyze/{recordingId}";
        String ANALYSIS = "/analysis/{id}";
    }

    /**
     * Dashboard endpoints
     */
    interface Dashboard {
        String PREFIX = API_PREFIX + "/dashboard";
        String SUMMARY = "/summary";
        String FUNNEL = "/funnel";
    }

    /**
     * Response codes
     */
    interface Code {
        int SUCCESS = 200;
        int CREATED = 201;
        int BAD_REQUEST = 400;
        int UNAUTHORIZED = 401;
        int FORBIDDEN = 403;
        int NOT_FOUND = 404;
        int INTERNAL_ERROR = 500;
        int BUSINESS_ERROR = 1001;
    }

    /**
     * JWT constants
     */
    interface Jwt {
        String HEADER = "Authorization";
        String PREFIX = "Bearer ";
        String SECRET = "zhixiao-ai-jwt-secret-key-2026-very-long-and-secure";
        long EXPIRATION = 86400000L;
    }

    /**
     * Recording transcribe status
     */
    interface TranscribeStatus {
        String PENDING = "pending";
        String PROCESSING = "processing";
        String COMPLETED = "completed";
        String FAILED = "failed";
    }

    /**
     * Analysis status
     */
    interface AnalyzeStatus {
        String PENDING = "pending";
        String COMPLETED = "completed";
        String FAILED = "failed";
    }

    /**
     * Opportunity stages
     */
    interface OpportunityStage {
        String DEMAND_CONFIRM = "需求确认";
        String SOLUTION_QUOTE = "方案报价";
        String BUSINESS_NEGOTIATION = "商务谈判";
        String WON = "赢单";
        String LOST = "输单";
    }
}
