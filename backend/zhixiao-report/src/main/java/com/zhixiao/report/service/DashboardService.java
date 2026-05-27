package com.zhixiao.report.service;

import com.zhixiao.report.dto.DashboardSummaryVO;
import com.zhixiao.report.dto.FunnelDataVO;
import jakarta.persistence.EntityManager;
import jakarta.persistence.PersistenceContext;
import org.springframework.stereotype.Service;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.LocalTime;
import java.util.ArrayList;
import java.util.List;

/**
 * Dashboard service - aggregates data from multiple tables
 */
@Service
public class DashboardService {

    @PersistenceContext
    private EntityManager entityManager;

    /**
     * Get dashboard summary statistics
     */
    public DashboardSummaryVO getSummary(Long companyId) {
        DashboardSummaryVO summary = new DashboardSummaryVO();

        // Total counts
        summary.setTotalCustomers(count("crm_customer", companyId));
        summary.setTotalOpportunities(count("crm_opportunity", companyId));
        summary.setTotalOrders(count("crm_order", companyId));
        summary.setTotalClues(count("crm_clue", companyId));
        summary.setTotalRecordings(count("rec_recording", companyId));

        // Today's new customers
        LocalDateTime todayStart = LocalDateTime.of(LocalDate.now(), LocalTime.MIN);
        summary.setNewCustomersToday(
                countSince("crm_customer", companyId, "created_at", todayStart));

        // Monthly new opportunities
        LocalDateTime monthStart = LocalDate.now().withDayOfMonth(1).atStartOfDay();
        summary.setNewOpportunitiesThisMonth(
                countSince("crm_opportunity", companyId, "created_at", monthStart));

        // Won/lost opportunities this month
        summary.setWonOpportunitiesThisMonth(
                countByStageSince("crm_opportunity", companyId, "赢单", monthStart));
        summary.setLostOpportunitiesThisMonth(
                countByStageSince("crm_opportunity", companyId, "输单", monthStart));

        // Amount totals
        summary.setTotalOrderAmount(sumAmount("crm_order", companyId, null));
        summary.setTotalOpportunityAmount(sumAmount("crm_opportunity", companyId, null));
        summary.setMonthlyOrderAmount(sumAmount("crm_order", companyId, monthStart));

        return summary;
    }

    /**
     * Get sales funnel data by opportunity stages
     */
    public FunnelDataVO getFunnelData(Long companyId) {
        FunnelDataVO funnel = new FunnelDataVO();
        List<FunnelDataVO.FunnelStage> stages = new ArrayList<>();

        String[] stageNames = {"需求确认", "方案报价", "商务谈判", "赢单"};
        for (String stageName : stageNames) {
            Long count = countByStage("crm_opportunity", companyId, stageName);
            Double amount = sumAmountByStage("crm_opportunity", companyId, stageName);
            stages.add(new FunnelDataVO.FunnelStage(stageName, count, amount != null ? amount : 0.0));
        }

        funnel.setStages(stages);
        return funnel;
    }

    private long count(String table, Long companyId) {
        Number result = (Number) entityManager.createNativeQuery(
                        "SELECT COUNT(*) FROM " + table + " WHERE company_id = :companyId AND is_deleted = 0")
                .setParameter("companyId", companyId)
                .getSingleResult();
        return result != null ? result.longValue() : 0;
    }

    private long countSince(String table, Long companyId, String dateColumn, LocalDateTime since) {
        Number result = (Number) entityManager.createNativeQuery(
                        "SELECT COUNT(*) FROM " + table +
                                " WHERE company_id = :companyId AND is_deleted = 0 AND " + dateColumn + " >= :since")
                .setParameter("companyId", companyId)
                .setParameter("since", since)
                .getSingleResult();
        return result != null ? result.longValue() : 0;
    }

    private long countByStage(String table, Long companyId, String stage) {
        Number result = (Number) entityManager.createNativeQuery(
                        "SELECT COUNT(*) FROM " + table +
                                " WHERE company_id = :companyId AND is_deleted = 0 AND stage = :stage")
                .setParameter("companyId", companyId)
                .setParameter("stage", stage)
                .getSingleResult();
        return result != null ? result.longValue() : 0;
    }

    private long countByStageSince(String table, Long companyId, String stage, LocalDateTime since) {
        Number result = (Number) entityManager.createNativeQuery(
                        "SELECT COUNT(*) FROM " + table +
                                " WHERE company_id = :companyId AND is_deleted = 0 AND stage = :stage AND created_at >= :since")
                .setParameter("companyId", companyId)
                .setParameter("stage", stage)
                .setParameter("since", since)
                .getSingleResult();
        return result != null ? result.longValue() : 0;
    }

    private double sumAmount(String table, Long companyId, LocalDateTime since) {
        String sql = "SELECT COALESCE(SUM(amount), 0) FROM " + table +
                " WHERE company_id = :companyId AND is_deleted = 0";
        if (since != null) {
            sql += " AND created_at >= :since";
        }
        var query = entityManager.createNativeQuery(sql)
                .setParameter("companyId", companyId);
        if (since != null) {
            query.setParameter("since", since);
        }
        Number result = (Number) query.getSingleResult();
        return result != null ? result.doubleValue() : 0.0;
    }

    private Double sumAmountByStage(String table, Long companyId, String stage) {
        Number result = (Number) entityManager.createNativeQuery(
                        "SELECT COALESCE(SUM(amount), 0) FROM " + table +
                                " WHERE company_id = :companyId AND is_deleted = 0 AND stage = :stage")
                .setParameter("companyId", companyId)
                .setParameter("stage", stage)
                .getSingleResult();
        return result != null ? result.doubleValue() : 0.0;
    }
}
