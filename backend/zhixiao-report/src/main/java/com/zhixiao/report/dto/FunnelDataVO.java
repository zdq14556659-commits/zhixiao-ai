package com.zhixiao.report.dto;

import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.util.List;

/**
 * Funnel data VO for sales pipeline
 */
@Data
public class FunnelDataVO {

    private List<FunnelStage> stages;

    @Data
    @NoArgsConstructor
    @AllArgsConstructor
    public static class FunnelStage {
        private String name;
        private long count;
        private double amount;
    }
}
