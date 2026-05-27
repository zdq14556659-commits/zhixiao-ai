package com.zhixiao.report.dto;

import lombok.Data;

/**
 * Dashboard summary VO
 */
@Data
public class DashboardSummaryVO {

    private long totalCustomers;
    private long totalOpportunities;
    private long totalOrders;
    private long totalClues;
    private long totalRecordings;

    private long newCustomersToday;
    private long newOpportunitiesThisMonth;
    private long wonOpportunitiesThisMonth;
    private long lostOpportunitiesThisMonth;

    private double totalOrderAmount;
    private double totalOpportunityAmount;
    private double monthlyOrderAmount;
}
