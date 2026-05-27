package com.zhixiao.customer.dto;

import com.zhixiao.customer.entity.Communication;
import com.zhixiao.customer.entity.Contact;
import com.zhixiao.customer.entity.Customer;
import lombok.Data;

import java.math.BigDecimal;
import java.util.List;

/**
 * Customer 360-degree detail view VO
 */
@Data
public class CustomerDetailVO {

    private Customer customer;
    private List<Contact> contacts;
    private List<Communication> communications;
    private List<OpportunityBrief> opportunities;
    private List<OrderBrief> orders;
    private List<RecordingBrief> recordings;

    @Data
    public static class OpportunityBrief {
        private Long id;
        private String name;
        private String stage;
        private BigDecimal amount;
        private Integer probability;
    }

    @Data
    public static class OrderBrief {
        private Long id;
        private String orderNo;
        private BigDecimal amount;
        private String status;
    }

    @Data
    public static class RecordingBrief {
        private Long id;
        private String fileName;
        private Integer duration;
        private String transcribeStatus;
    }
}
