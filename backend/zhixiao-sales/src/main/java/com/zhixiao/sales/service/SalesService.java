package com.zhixiao.sales.service;

import com.zhixiao.common.exception.BusinessException;
import com.zhixiao.sales.entity.Opportunity;
import com.zhixiao.sales.entity.OpportunityLog;
import com.zhixiao.sales.entity.Order;
import com.zhixiao.sales.repository.OpportunityLogRepository;
import com.zhixiao.sales.repository.OpportunityRepository;
import com.zhixiao.sales.repository.OrderRepository;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.util.List;
import java.util.UUID;

/**
 * Sales service - opportunity pipeline and order management
 */
@Service
public class SalesService {

    @Autowired
    private OpportunityRepository opportunityRepository;

    @Autowired
    private OpportunityLogRepository opportunityLogRepository;

    @Autowired
    private OrderRepository orderRepository;

    // ===== Opportunity CRUD =====

    public Opportunity findOpportunityById(Long id) {
        return opportunityRepository.findById(id)
                .orElseThrow(() -> new BusinessException("Opportunity not found: " + id));
    }

    public Page<Opportunity> listOpportunities(Long companyId, Pageable pageable) {
        return opportunityRepository.findByCompanyIdAndIsDeleted(companyId, 0, pageable);
    }

    @Transactional
    public Opportunity createOpportunity(Opportunity opportunity) {
        return opportunityRepository.save(opportunity);
    }

    @Transactional
    public Opportunity updateOpportunity(Long id, Opportunity updated) {
        Opportunity opp = findOpportunityById(id);
        if (updated.getName() != null) opp.setName(updated.getName());
        if (updated.getStage() != null) opp.setStage(updated.getStage());
        if (updated.getAmount() != null) opp.setAmount(updated.getAmount());
        if (updated.getProbability() != null) opp.setProbability(updated.getProbability());
        if (updated.getExpectedClosedAt() != null) opp.setExpectedClosedAt(updated.getExpectedClosedAt());
        if (updated.getCompetitor() != null) opp.setCompetitor(updated.getCompetitor());
        if (updated.getReason() != null) opp.setReason(updated.getReason());
        if (updated.getOwnerId() != null) opp.setOwnerId(updated.getOwnerId());
        return opportunityRepository.save(opp);
    }

    @Transactional
    public void deleteOpportunity(Long id) {
        Opportunity opp = findOpportunityById(id);
        opp.setIsDeleted(1);
        opportunityRepository.save(opp);
    }

    /**
     * Change opportunity stage with log
     */
    @Transactional
    public Opportunity changeStage(Long id, String newStage, String remark, Long operatorId) {
        Opportunity opp = findOpportunityById(id);
        String oldStage = opp.getStage();

        // Update stage-specific fields
        if ("赢单".equals(newStage)) {
            opp.setProbability(100);
            opp.setWinReason(remark);
        } else if ("输单".equals(newStage)) {
            opp.setProbability(0);
            opp.setLoseReason(remark);
        }

        opp.setStage(newStage);
        opportunityRepository.save(opp);

        // Create stage change log
        OpportunityLog log = new OpportunityLog();
        log.setOpportunityId(id);
        log.setFromStage(oldStage);
        log.setToStage(newStage);
        log.setOperatorId(operatorId);
        log.setRemark(remark);
        opportunityLogRepository.save(log);

        return opp;
    }

    /**
     * Get opportunity stage change history
     */
    public List<OpportunityLog> getStageHistory(Long opportunityId) {
        return opportunityLogRepository.findByOpportunityIdOrderByCreatedAtDesc(opportunityId);
    }

    // ===== Order CRUD =====

    public Order findOrderById(Long id) {
        return orderRepository.findById(id)
                .orElseThrow(() -> new BusinessException("Order not found: " + id));
    }

    public Page<Order> listOrders(Long companyId, Pageable pageable) {
        return orderRepository.findByCompanyIdAndIsDeleted(companyId, 0, pageable);
    }

    @Transactional
    public Order createOrder(Order order) {
        if (order.getOrderNo() == null || order.getOrderNo().isEmpty()) {
            order.setOrderNo(generateOrderNo());
        }
        return orderRepository.save(order);
    }

    @Transactional
    public Order updateOrder(Long id, Order updated) {
        Order order = findOrderById(id);
        if (updated.getAmount() != null) order.setAmount(updated.getAmount());
        if (updated.getStatus() != null) order.setStatus(updated.getStatus());
        if (updated.getSignDate() != null) order.setSignDate(updated.getSignDate());
        if (updated.getDeliveryDate() != null) order.setDeliveryDate(updated.getDeliveryDate());
        if (updated.getRemark() != null) order.setRemark(updated.getRemark());
        return orderRepository.save(order);
    }

    @Transactional
    public void deleteOrder(Long id) {
        Order order = findOrderById(id);
        order.setIsDeleted(1);
        orderRepository.save(order);
    }

    private String generateOrderNo() {
        return "ORD" + LocalDateTime.now().format(java.time.format.DateTimeFormatter.ofPattern("yyyyMMddHHmmss"))
                + UUID.randomUUID().toString().substring(0, 4).toUpperCase();
    }
}
